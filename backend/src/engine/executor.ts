import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.js';
import { getRequiredInputs, isExecutableNodeType } from './contracts/node-registry.js';
import {
  collectInputs,
  failWorkflowAtNode,
  getNodeDisplayName,
  topoSort,
  validateWorkflow,
} from './executor-helpers.js';
import { NODE_EXECUTORS } from './nodes/index.js';
import type { DynamicValue, RuntimeApiConfig, WorkflowNode } from './nodes/types.js';

const ITERATE_RUN_NODE_TYPE = 'iterateRun';
const ITERATE_IMAGE_RUN_NODE_TYPE = 'iterateImageRun';
const DEFAULT_WORKFLOW_CONCURRENCY = {
  enabled: false,
  maxConcurrency: 5,
};

type WorkflowEdge = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

type Workflow = {
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  [key: string]: DynamicValue;
};

type WorkflowOutputs = Record<string, Record<string, DynamicValue> | undefined>;
type SendSSE = (event: string, data: Record<string, DynamicValue>) => unknown;
type ProgressCallback = (message: string) => void;
type NodeExecutor = (
  node: WorkflowNode,
  inputs: Record<string, DynamicValue>,
  apiConfig: RuntimeApiConfig,
  progress: ProgressCallback,
) => Promise<Record<string, DynamicValue>> | Record<string, DynamicValue>;

type WorkflowConcurrency = {
  enabled: boolean;
  maxConcurrency: number;
};

type IterationItem = {
  value: DynamicValue;
  outputKey: 'image' | 'text';
  inputHandle: string;
  sourceNodeId: string;
  sourceHandle: string;
};

type IterationContext = {
  sourceNodeId: string;
  index: number;
  total: number;
  inputHandle: string;
  sourceInputNodeId: string;
  sourceHandle: string;
  parent?: IterationContext;
};

type ExecutionContext = {
  getNodeLogOutputs?: (
    result: Record<string, DynamicValue>,
    context: { node: WorkflowNode; nodes: WorkflowNode[]; workflow: Workflow },
  ) => DynamicValue;
};

type WorkflowError = Error & {
  workflowTerminated?: boolean;
  nodeErrorAlreadySent?: boolean;
};

function normalizeWorkflowConcurrency(value: DynamicValue): WorkflowConcurrency {
  const enabled = value?.enabled === true;
  const parsedMaxConcurrency = Number(value?.maxConcurrency);
  const maxConcurrency =
    Number.isFinite(parsedMaxConcurrency) && parsedMaxConcurrency > 0
      ? Math.max(1, Math.round(parsedMaxConcurrency))
      : DEFAULT_WORKFLOW_CONCURRENCY.maxConcurrency;
  return {
    enabled,
    maxConcurrency: enabled ? maxConcurrency : 1,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  if (items.length === 0) return [];
  const errors: unknown[] = [];
  if (maxConcurrency <= 1) {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += 1) {
      try {
        results.push(await worker(items[index], index));
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw errors[0];
    return results;
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        errors.push(error);
      }
    }
  });
  await Promise.all(workers);
  if (errors.length > 0) throw errors[0];
  return results;
}

function isIterateControlNodeType(type?: string): boolean {
  return type === ITERATE_RUN_NODE_TYPE || type === ITERATE_IMAGE_RUN_NODE_TYPE;
}

function getIterateMissingInputError(type?: string): string {
  return type === ITERATE_IMAGE_RUN_NODE_TYPE ? '图像逐项运行没有可用的图片输入' : '逐项运行没有可用的文本输入';
}

function getReachableNodeIds(sourceId: string, edges: WorkflowEdge[]): Set<string> {
  const reachable = new Set<string>();
  const queue = edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target);

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const edge of edges) {
      if (edge.source === nodeId) queue.push(edge.target);
    }
  }

  return reachable;
}

function getIterateInputIndex(handleId?: string): number {
  const match = String(handleId || '').match(/^item(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizeIterationItems(value: DynamicValue): DynamicValue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeIterationItems(item));
  }

  if (value === undefined || value === null) return [];

  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }

  return [value];
}

function collectIterationItems(
  iterateNode: WorkflowNode,
  edges: WorkflowEdge[],
  outputs: WorkflowOutputs,
): IterationItem[] {
  return edges
    .filter((edge) => edge.target === iterateNode.id)
    .sort((edgeA, edgeB) => getIterateInputIndex(edgeA.targetHandle) - getIterateInputIndex(edgeB.targetHandle))
    .flatMap((edge) => {
      const sourceOutput = outputs[edge.source];
      const value = sourceOutput?.[edge.sourceHandle || ''];
      return normalizeIterationItems(value).map((item) => ({
        value: item,
        outputKey: iterateNode.type === ITERATE_IMAGE_RUN_NODE_TYPE ? 'image' : 'text',
        inputHandle: edge.targetHandle || '',
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle || '',
      }));
    });
}

export async function executeWorkflow(
  workflow: Workflow,
  apiConfig: RuntimeApiConfig,
  sendSSE: SendSSE,
  executionContext: ExecutionContext = {},
): Promise<void> {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const abortSignal = apiConfig?.abortSignal;
  const workflowConcurrency = normalizeWorkflowConcurrency(apiConfig?.workflowExecution);

  if (!nodes || nodes.length === 0) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: '工作流中没有节点' });
    return;
  }

  const executableNodes = nodes.filter((node) => isExecutableNodeType(String(node.type || '')) && !node.data?.disabled);
  const executableNodeIds = new Set(executableNodes.map((node) => String(node.id || '')));
  const executableEdges = edges.filter(
    (edge) => executableNodeIds.has(edge.source) && executableNodeIds.has(edge.target),
  );

  if (executableNodes.length === 0) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: '工作流中没有可执行节点' });
    return;
  }

  try {
    validateWorkflow(executableNodes, executableEdges, new Set(Object.keys(NODE_EXECUTORS)));
  } catch (error) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  let sorted: WorkflowNode[];
  try {
    sorted = topoSort(executableNodes, executableEdges);
  } catch (error) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const outputs: WorkflowOutputs = {};
  const failedNodeErrors: Record<string, string> = {};
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  const sortedIndexByNodeId = new Map(sorted.map((node, index) => [String(node.id || ''), index]));

  const runNode = async (
    node: WorkflowNode,
    index: number,
    total: number,
    scopedOutputs: WorkflowOutputs,
    iteration: IterationContext | null = null,
  ): Promise<Record<string, DynamicValue>> => {
    if (abortSignal?.aborted) {
      throw new Error('工作流已手动停止');
    }

    const executor = (NODE_EXECUTORS as Record<string, NodeExecutor | undefined>)[String(node.type || '')];
    const nodeLabel = getNodeDisplayName(node, executableNodes);
    const nodeStartTime = Date.now();

    if (!executor) {
      failCount += 1;
      failedNodeErrors[String(node.id || '')] = `${nodeLabel} 暂未实现`;
      failWorkflowAtNode({
        node,
        nodes: executableNodes,
        index,
        total,
        error: `${nodeLabel} 暂未实现`,
        sendSSE,
      });
    }

    sendSSE(WORKFLOW_SSE_EVENTS.NODE_STARTED, {
      nodeId: node.id,
      nodeType: node.type,
      index,
      total,
      ...(iteration ? { iteration } : {}),
    });

    try {
      const inputs = collectInputs(node, executableEdges, scopedOutputs);
      const requiredInputs = getRequiredInputs(String(node.type || ''));
      const missingInputs = requiredInputs.filter((key) => {
        const value = inputs[key];
        return value === undefined || value === null || value === '';
      });

      if (missingInputs.length > 0) {
        failCount += 1;
        failedNodeErrors[String(node.id || '')] = `${nodeLabel} 缺少必填输入: ${missingInputs.join(', ')}`;
        failWorkflowAtNode({
          node,
          nodes: executableNodes,
          index,
          total,
          error: `${nodeLabel} 缺少必填输入: ${missingInputs.join(', ')}`,
          sendSSE,
        });
      }

      const result = await executor(node, inputs, apiConfig, (message) => {
        sendSSE(WORKFLOW_SSE_EVENTS.NODE_PROGRESS, {
          nodeId: node.id,
          progress: -1,
          message,
          ...(iteration ? { iteration } : {}),
        });
      });

      scopedOutputs[String(node.id || '')] = result;
      successCount += 1;

      sendSSE(WORKFLOW_SSE_EVENTS.NODE_COMPLETED, {
        nodeId: node.id,
        outputs: result,
        logOutputs: executionContext.getNodeLogOutputs
          ? executionContext.getNodeLogOutputs(result, {
              node,
              nodes: executableNodes,
              workflow,
            })
          : result,
        duration: Date.now() - nodeStartTime,
        ...(iteration ? { iteration } : {}),
      });

      return result;
    } catch (error) {
      const workflowError = error as WorkflowError;
      const message = workflowError.message || `${nodeLabel} 执行失败`;
      if (!workflowError.workflowTerminated) {
        failCount += 1;
      }
      failedNodeErrors[String(node.id || '')] = message;
      if (!workflowError.nodeErrorAlreadySent) {
        sendSSE(WORKFLOW_SSE_EVENTS.NODE_FAILED, {
          nodeId: node.id,
          error: message,
          ...(iteration ? { iteration } : {}),
        });
      }
      throw error;
    }
  };

  const runSegment = async (
    segmentNodes: WorkflowNode[],
    scopedOutputs: WorkflowOutputs,
    parentIteration: IterationContext | null = null,
  ): Promise<void> => {
    const segmentNodeIds = new Set(segmentNodes.map((node) => String(node.id || '')));
    const segmentNodesById = new Map(segmentNodes.map((node) => [String(node.id || ''), node]));
    const controlledNodeIds = new Set<string>();
    const controlledDownstreamByNodeId = new Map<string, Set<string>>();

    for (const node of segmentNodes) {
      if (!isIterateControlNodeType(String(node.type || ''))) continue;
      const downstreamIds = new Set(
        [...getReachableNodeIds(String(node.id || ''), executableEdges)].filter((nodeId) => segmentNodeIds.has(nodeId)),
      );
      controlledDownstreamByNodeId.set(String(node.id || ''), downstreamIds);
      downstreamIds.forEach((nodeId) => controlledNodeIds.add(nodeId));
    }

    const runnableNodes = segmentNodes.filter((node) => !controlledNodeIds.has(String(node.id || '')));
    const runnableNodeIds = new Set(runnableNodes.map((node) => String(node.id || '')));
    const pendingNodeIds = new Set(runnableNodes.map((node) => String(node.id || '')));
    const running = new Map<string, Promise<{ nodeId: string; status: 'fulfilled' | 'rejected'; error?: unknown }>>();
    const completedNodeIds = new Set<string>();
    let firstError: unknown = null;

    const getNodeIndex = (nodeId?: string) => sortedIndexByNodeId.get(String(nodeId || '')) ?? 0;

    const getOperationDependencies = (node: WorkflowNode): Set<string> => {
      const dependencies = new Set(
        executableEdges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
      );

      if (isIterateControlNodeType(String(node.type || ''))) {
        const controlledDownstreamIds = controlledDownstreamByNodeId.get(String(node.id || '')) || new Set();
        for (const edge of executableEdges) {
          if (!controlledDownstreamIds.has(edge.target)) continue;
          if (controlledDownstreamIds.has(edge.source) || edge.source === node.id) continue;
          dependencies.add(edge.source);
        }
      }

      return dependencies;
    };

    const dependenciesReady = (dependencies: Set<string>) =>
      [...dependencies].every((nodeId) => {
        if (runnableNodeIds.has(nodeId)) return completedNodeIds.has(nodeId);
        return Object.prototype.hasOwnProperty.call(scopedOutputs, nodeId);
      });

    const runIterateNode = async (node: WorkflowNode) => {
      const index = getNodeIndex(node.id);
      const controlledDownstreamIds = controlledDownstreamByNodeId.get(String(node.id || '')) || new Set();
      const downstreamNodes = segmentNodes.filter((item) => controlledDownstreamIds.has(String(item.id || '')));
      const iterationItems = collectIterationItems(node, executableEdges, scopedOutputs);
      if (iterationItems.length === 0) {
        failCount += 1;
        failWorkflowAtNode({
          node,
          nodes: executableNodes,
          index,
          total: sorted.length,
          error: getIterateMissingInputError(String(node.type || '')),
          sendSSE,
        });
      }

      await runWithConcurrency(
        iterationItems,
        async (item, iterationIndex) => {
          const iteration: IterationContext = {
            sourceNodeId: String(node.id || ''),
            index: iterationIndex + 1,
            total: iterationItems.length,
            inputHandle: item.inputHandle,
            sourceInputNodeId: item.sourceNodeId,
            sourceHandle: item.sourceHandle,
            ...(parentIteration ? { parent: parentIteration } : {}),
          };
          const iterationOutputs = {
            ...scopedOutputs,
            [String(node.id || '')]: { [item.outputKey]: item.value },
          };

          sendSSE(WORKFLOW_SSE_EVENTS.NODE_STARTED, {
            nodeId: node.id,
            nodeType: node.type,
            index,
            total: sorted.length,
            iteration,
          });
          sendSSE(WORKFLOW_SSE_EVENTS.NODE_COMPLETED, {
            nodeId: node.id,
            outputs: { [item.outputKey]: item.value },
            logOutputs: { [item.outputKey]: item.value },
            duration: 0,
            iteration,
          });

          await runSegment(downstreamNodes, iterationOutputs, iteration);
        },
        workflowConcurrency.maxConcurrency,
      );
    };

    const runOperation = async (node: WorkflowNode) => {
      if (isIterateControlNodeType(String(node.type || ''))) {
        await runIterateNode(node);
        return;
      }
      await runNode(node, getNodeIndex(node.id), sorted.length, scopedOutputs, parentIteration);
    };

    const startReadyOperations = () => {
      if (firstError) return;

      for (const nodeId of [...pendingNodeIds]) {
        if (running.size >= workflowConcurrency.maxConcurrency) return;
        const node = segmentNodesById.get(nodeId);
        if (!node) continue;
        const dependencies = getOperationDependencies(node);
        if (!dependenciesReady(dependencies)) continue;

        pendingNodeIds.delete(nodeId);
        const promise = runOperation(node)
          .then(() => ({ nodeId, status: 'fulfilled' as const }))
          .catch((error: unknown) => ({ nodeId, status: 'rejected' as const, error }));
        running.set(nodeId, promise);
      }
    };

    while (pendingNodeIds.size > 0 || running.size > 0) {
      startReadyOperations();

      if (running.size === 0) {
        if (firstError) throw firstError;
        const blockedNodeId = pendingNodeIds.values().next().value;
        const blockedNode = blockedNodeId ? segmentNodesById.get(blockedNodeId) : undefined;
        throw new Error(
          `Workflow execution could not resolve dependencies for node: ${blockedNode?.id || blockedNodeId}`,
        );
      }

      const settled = await Promise.race(running.values());
      running.delete(settled.nodeId);
      if (settled.status === 'rejected') {
        firstError = firstError || settled.error;
      } else {
        completedNodeIds.add(settled.nodeId);
      }
    }

    if (firstError) throw firstError;
  };

  await runSegment(sorted, outputs);
  sendSSE(WORKFLOW_SSE_EVENTS.RUN_COMPLETED, {
    totalDuration: Date.now() - startTime,
    successCount,
    failCount,
  });
}
