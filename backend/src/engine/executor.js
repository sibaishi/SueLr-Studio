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

const ITERATE_RUN_NODE_TYPE = 'iterateRun';
const ITERATE_IMAGE_RUN_NODE_TYPE = 'iterateImageRun';
const DEFAULT_WORKFLOW_CONCURRENCY = {
  enabled: false,
  maxConcurrency: 5,
};

function normalizeWorkflowConcurrency(value) {
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

async function runWithConcurrency(items, worker, maxConcurrency) {
  if (items.length === 0) return [];
  const errors = [];
  if (maxConcurrency <= 1) {
    const results = [];
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

  const results = new Array(items.length);
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

function isIterateControlNodeType(type) {
  return type === ITERATE_RUN_NODE_TYPE || type === ITERATE_IMAGE_RUN_NODE_TYPE;
}

function getIterateMissingInputError(type) {
  return type === ITERATE_IMAGE_RUN_NODE_TYPE ? '图像逐项运行没有可用的图片输入' : '逐项运行没有可用的文本输入';
}

function getReachableNodeIds(sourceId, edges) {
  const reachable = new Set();
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

function getIterateInputIndex(handleId) {
  const match = String(handleId || '').match(/^item(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizeIterationItems(value) {
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

function collectIterationItems(iterateNode, edges, outputs) {
  return edges
    .filter((edge) => edge.target === iterateNode.id)
    .sort((edgeA, edgeB) => getIterateInputIndex(edgeA.targetHandle) - getIterateInputIndex(edgeB.targetHandle))
    .flatMap((edge) => {
      const sourceOutput = outputs[edge.source];
      const value = sourceOutput?.[edge.sourceHandle];
      return normalizeIterationItems(value).map((item) => ({
        value: item,
        outputKey: iterateNode.type === ITERATE_IMAGE_RUN_NODE_TYPE ? 'image' : 'text',
        inputHandle: edge.targetHandle || '',
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle || '',
      }));
    });
}

export async function executeWorkflow(workflow, apiConfig, sendSSE, executionContext = {}) {
  const { nodes, edges } = workflow;
  const abortSignal = apiConfig?.abortSignal;
  const workflowConcurrency = normalizeWorkflowConcurrency(apiConfig?.workflowExecution);

  if (!nodes || nodes.length === 0) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: '工作流中没有节点' });
    return;
  }

  const executableNodes = nodes.filter((node) => isExecutableNodeType(node.type) && !node.data?.disabled);
  const executableNodeIds = new Set(executableNodes.map((node) => node.id));
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
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: error.message });
    return;
  }

  let sorted;
  try {
    sorted = topoSort(executableNodes, executableEdges);
  } catch (error) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: error.message });
    return;
  }

  const outputs = {};
  const failedNodeErrors = {};
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  const sortedIndexByNodeId = new Map(sorted.map((node, index) => [node.id, index]));

  const runNode = async (node, index, total, scopedOutputs, iteration = null) => {
    if (abortSignal?.aborted) {
      throw new Error('工作流已手动停止');
    }

    const executor = NODE_EXECUTORS[node.type];
    const nodeLabel = getNodeDisplayName(node, executableNodes);
    const nodeStartTime = Date.now();

    if (!executor) {
      failCount += 1;
      failedNodeErrors[node.id] = `${nodeLabel} 暂未实现`;
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
      const requiredInputs = getRequiredInputs(node.type);
      const missingInputs = requiredInputs.filter((key) => {
        const value = inputs[key];
        return value === undefined || value === null || value === '';
      });

      if (missingInputs.length > 0) {
        failCount += 1;
        failedNodeErrors[node.id] = `${nodeLabel} 缺少必填输入: ${missingInputs.join(', ')}`;
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

      scopedOutputs[node.id] = result;
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
      const message = error.message || `${nodeLabel} 执行失败`;
      if (!error.workflowTerminated) {
        failCount += 1;
      }
      failedNodeErrors[node.id] = message;
      if (!error.nodeErrorAlreadySent) {
        sendSSE(WORKFLOW_SSE_EVENTS.NODE_FAILED, {
          nodeId: node.id,
          error: message,
          ...(iteration ? { iteration } : {}),
        });
      }
      throw error;
    }
  };

  const runSegment = async (segmentNodes, scopedOutputs, parentIteration = null) => {
    const segmentNodeIds = new Set(segmentNodes.map((node) => node.id));
    const segmentNodesById = new Map(segmentNodes.map((node) => [node.id, node]));
    const controlledNodeIds = new Set();
    const controlledDownstreamByNodeId = new Map();

    for (const node of segmentNodes) {
      if (!isIterateControlNodeType(node.type)) continue;
      const downstreamIds = new Set(
        [...getReachableNodeIds(node.id, executableEdges)].filter((nodeId) => segmentNodeIds.has(nodeId)),
      );
      controlledDownstreamByNodeId.set(node.id, downstreamIds);
      downstreamIds.forEach((nodeId) => controlledNodeIds.add(nodeId));
    }

    const runnableNodes = segmentNodes.filter((node) => !controlledNodeIds.has(node.id));
    const runnableNodeIds = new Set(runnableNodes.map((node) => node.id));
    const pendingNodeIds = new Set(runnableNodes.map((node) => node.id));
    const running = new Map();
    const completedNodeIds = new Set();
    let firstError = null;

    const getNodeIndex = (nodeId) => sortedIndexByNodeId.get(nodeId) ?? 0;

    const getOperationDependencies = (node) => {
      const dependencies = new Set(
        executableEdges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
      );

      if (isIterateControlNodeType(node.type)) {
        const controlledDownstreamIds = controlledDownstreamByNodeId.get(node.id) || new Set();
        for (const edge of executableEdges) {
          if (!controlledDownstreamIds.has(edge.target)) continue;
          if (controlledDownstreamIds.has(edge.source) || edge.source === node.id) continue;
          dependencies.add(edge.source);
        }
      }

      return dependencies;
    };

    const dependenciesReady = (dependencies) =>
      [...dependencies].every((nodeId) => {
        if (runnableNodeIds.has(nodeId)) return completedNodeIds.has(nodeId);
        return Object.prototype.hasOwnProperty.call(scopedOutputs, nodeId);
      });

    const runIterateNode = async (node) => {
      const index = getNodeIndex(node.id);
      const controlledDownstreamIds = controlledDownstreamByNodeId.get(node.id) || new Set();
      const downstreamNodes = segmentNodes.filter((item) => controlledDownstreamIds.has(item.id));
      const iterationItems = collectIterationItems(node, executableEdges, scopedOutputs);
      if (iterationItems.length === 0) {
        failCount += 1;
        failWorkflowAtNode({
          node,
          nodes: executableNodes,
          index,
          total: sorted.length,
          error: getIterateMissingInputError(node.type),
          sendSSE,
        });
      }

      await runWithConcurrency(
        iterationItems,
        async (item, iterationIndex) => {
          const iteration = {
            sourceNodeId: node.id,
            index: iterationIndex + 1,
            total: iterationItems.length,
            inputHandle: item.inputHandle,
            sourceInputNodeId: item.sourceNodeId,
            sourceHandle: item.sourceHandle,
            ...(parentIteration ? { parent: parentIteration } : {}),
          };
          const iterationOutputs = {
            ...scopedOutputs,
            [node.id]: { [item.outputKey]: item.value },
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

    const runOperation = async (node) => {
      if (isIterateControlNodeType(node.type)) {
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
          .then(() => ({ nodeId, status: 'fulfilled' }))
          .catch((error) => ({ nodeId, status: 'rejected', error }));
        running.set(nodeId, promise);
      }
    };

    while (pendingNodeIds.size > 0 || running.size > 0) {
      startReadyOperations();

      if (running.size === 0) {
        if (firstError) throw firstError;
        const blockedNodeId = pendingNodeIds.values().next().value;
        const blockedNode = segmentNodesById.get(blockedNodeId);
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
