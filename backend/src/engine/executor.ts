import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.ts';
import { normalizeConcurrencyConfig } from '../platform/runtime/concurrency.ts';
import { getRequiredInputs, isExecutableNodeType } from './contracts/node-registry.ts';
import {
  collectInputs,
  failWorkflowAtNode,
  getNodeDisplayName,
  topoSort,
  validateWorkflow,
} from './executor-helpers.ts';
import { NODE_EXECUTORS } from './nodes/index.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './nodes/types.ts';

type WorkflowEdge = {
  id?: string;
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
type NodeExecutor = (
  node: WorkflowNode,
  inputs: Record<string, DynamicValue>,
  apiConfig: RuntimeApiConfig,
  progress: ProgressCallback,
) => Promise<Record<string, DynamicValue>> | Record<string, DynamicValue>;

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

export async function executeWorkflow(
  workflow: Workflow,
  apiConfig: RuntimeApiConfig,
  sendSSE: SendSSE,
  executionContext: ExecutionContext = {},
): Promise<void> {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const abortSignal = apiConfig?.abortSignal;
  const workflowConcurrency = normalizeConcurrencyConfig(apiConfig?.workflowExecution);

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
    });

    try {
      const inputs = collectInputs(node, executableEdges, outputs, executableNodes);
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

      const result = await executor(node, inputs, apiConfig, (message, data) => {
        sendSSE(WORKFLOW_SSE_EVENTS.NODE_PROGRESS, {
          nodeId: node.id,
          progress: -1,
          message,
          ...(data || {}),
        });
      });

      outputs[String(node.id || '')] = result;
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
        });
      }
      throw error;
    }
  };

  const nodesById = new Map(sorted.map((node) => [String(node.id || ''), node]));
  const pendingNodeIds = new Set(nodesById.keys());
  const running = new Map<string, Promise<{ nodeId: string; status: 'fulfilled' | 'rejected'; error?: unknown }>>();
  const completedNodeIds = new Set<string>();
  let firstError: unknown = null;

  const startReadyOperations = () => {
    if (firstError) return;

    for (const nodeId of [...pendingNodeIds]) {
      if (running.size >= workflowConcurrency.maxConcurrency) return;
      const node = nodesById.get(nodeId);
      if (!node) continue;
      const waitingForUpstream = executableEdges.some(
        (edge) => edge.target === nodeId && !completedNodeIds.has(edge.source),
      );
      if (waitingForUpstream) continue;

      pendingNodeIds.delete(nodeId);
      const promise = runNode(node, sortedIndexByNodeId.get(nodeId) ?? 0, sorted.length)
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
      const blockedNode = blockedNodeId ? nodesById.get(blockedNodeId) : undefined;
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

  sendSSE(WORKFLOW_SSE_EVENTS.RUN_COMPLETED, {
    totalDuration: Date.now() - startTime,
    successCount,
    failCount,
  });
}
