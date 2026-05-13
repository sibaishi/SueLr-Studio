import { getNodeContract, getRequiredInputs, isExecutableNodeType } from './contracts/node-registry.js';
import {
  collectInputs,
  failWorkflowAtNode,
  getNodeDisplayName,
  topoSort,
  validateWorkflow,
} from './executor-helpers.js';
import { NODE_EXECUTORS } from './nodes/index.js';
import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.js';

const ITERATE_RUN_NODE_TYPE = 'iterateRun';
const ITERATE_IMAGE_RUN_NODE_TYPE = 'iterateImageRun';

function isIterateControlNodeType(type) {
  return type === ITERATE_RUN_NODE_TYPE || type === ITERATE_IMAGE_RUN_NODE_TYPE;
}

function isMergeAggregationNodeType(type) {
  return getNodeContract(type)?.category === 'merge';
}

function getIterateMissingInputError(type) {
  return type === ITERATE_IMAGE_RUN_NODE_TYPE
    ? '图像逐项运行没有可用的图片输入'
    : '逐项运行没有可用的文本输入';
}

function getControlledIterationNodeIds(sourceId, edges, segmentNodeIds, nodeLookup) {
  const controlled = new Set();
  const queue = edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => edge.target);

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || controlled.has(nodeId) || !segmentNodeIds.has(nodeId)) continue;

    const node = nodeLookup.get(nodeId);
    if (!node || isMergeAggregationNodeType(node.type)) continue;

    controlled.add(nodeId);
    for (const edge of edges) {
      if (edge.source === nodeId) queue.push(edge.target);
    }
  }

  return controlled;
}

function getIterateInputIndex(handleId) {
  const match = String(handleId || '').match(/^item(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizeIterationItems(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeIterationItems(item))
      .flat();
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

function mergeRepeatedOutputValue(existing, next) {
  if (existing === undefined) return next;
  if (Array.isArray(existing) && Array.isArray(next)) return [...existing, ...next];
  if (Array.isArray(existing)) return [...existing, next];
  if (Array.isArray(next)) return [existing, ...next];
  return [existing, next];
}

function appendRepeatedNodeOutputs(existing, next) {
  if (!next) return existing;
  if (!existing) return next;

  const merged = { ...existing };
  for (const [key, value] of Object.entries(next)) {
    merged[key] = mergeRepeatedOutputValue(merged[key], value);
  }
  return merged;
}

export async function executeWorkflow(workflow, apiConfig, sendSSE, executionContext = {}) {
  const { nodes, edges } = workflow;
  const abortSignal = apiConfig?.abortSignal;

  if (!nodes || nodes.length === 0) {
    sendSSE(WORKFLOW_SSE_EVENTS.VALIDATION_FAILED, { error: '工作流中没有节点' });
    return;
  }

  const executableNodes = nodes.filter((node) => isExecutableNodeType(node.type) && !node.data?.disabled);
  const executableNodeIds = new Set(executableNodes.map((node) => node.id));
  const executableEdges = edges.filter((edge) => executableNodeIds.has(edge.source) && executableNodeIds.has(edge.target));

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

  const iterateNodes = executableNodes.filter((node) => isIterateControlNodeType(node.type));
  const executableNodeLookup = new Map(executableNodes.map((node) => [node.id, node]));

  const outputs = {};
  const failedNodeErrors = {};
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

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
      const failedDependencies = executableEdges
        .filter((edge) => edge.target === node.id && failedNodeErrors[edge.source])
        .map((edge) => ({
          source: edge.source,
          targetHandle: edge.targetHandle,
          error: failedNodeErrors[edge.source],
        }));

      if (failedDependencies.length > 0) {
        failCount += 1;
        const firstFailed = failedDependencies[0];
        const sourceNode = executableNodes.find((item) => item.id === firstFailed.source);
        const sourceLabel = getNodeDisplayName(sourceNode, executableNodes);
        failedNodeErrors[node.id] = `依赖节点 ${sourceLabel} 执行失败`;
        failWorkflowAtNode({
          node,
          nodes: executableNodes,
          index,
          total,
          error: `上游节点执行失败，${nodeLabel} 已中断。失败节点：${sourceLabel}${firstFailed.targetHandle ? ` -> ${firstFailed.targetHandle}` : ''}；原因：${firstFailed.error}`,
          sendSSE,
        });
      }

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
    const handledNodeIds = new Set();

    for (let index = 0; index < segmentNodes.length; index += 1) {
      const node = segmentNodes[index];
      if (handledNodeIds.has(node.id)) continue;

      if (!isIterateControlNodeType(node.type)) {
        await runNode(node, index, sorted.length, scopedOutputs, parentIteration);
        continue;
      }

      const controlledDownstreamIds = getControlledIterationNodeIds(
        node.id,
        executableEdges,
        segmentNodeIds,
        executableNodeLookup,
      );
      const downstreamNodes = segmentNodes.filter((item) => controlledDownstreamIds.has(item.id));
      controlledDownstreamIds.forEach((nodeId) => handledNodeIds.add(nodeId));

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

      for (let iterationIndex = 0; iterationIndex < iterationItems.length; iterationIndex += 1) {
        const item = iterationItems[iterationIndex];
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

        scopedOutputs[node.id] = appendRepeatedNodeOutputs(scopedOutputs[node.id], {
          [item.outputKey]: item.value,
        });
        await runSegment(downstreamNodes, iterationOutputs, iteration);

        for (const repeatedNodeId of controlledDownstreamIds) {
          if (!iterationOutputs[repeatedNodeId]) continue;
          scopedOutputs[repeatedNodeId] = appendRepeatedNodeOutputs(
            scopedOutputs[repeatedNodeId],
            iterationOutputs[repeatedNodeId],
          );
        }
      }
    }
  };

  if (iterateNodes.length === 0) {
    for (let index = 0; index < sorted.length; index += 1) {
      await runNode(sorted[index], index, sorted.length, outputs);
    }
  } else {
    await runSegment(sorted, outputs);
  }
  sendSSE(WORKFLOW_SSE_EVENTS.RUN_COMPLETED, {
    totalDuration: Date.now() - startTime,
    successCount,
    failCount,
  });
}
