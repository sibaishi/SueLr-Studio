import { getRequiredInputs, isExecutableNodeType } from './contracts/node-registry.js';
import {
  collectInputs,
  failWorkflowAtNode,
  getNodeDisplayName,
  topoSort,
  validateWorkflow,
} from './executor-helpers.js';
import { NODE_EXECUTORS } from './nodes/index.js';
import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.js';

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

  const outputs = {};
  const failedNodeErrors = {};
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    if (abortSignal?.aborted) {
      throw new Error('工作流已手动停止');
    }

    const node = sorted[index];
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
          total: sorted.length,
          error: `${nodeLabel} 暂未实现`,
        sendSSE,
      });
    }

    sendSSE(WORKFLOW_SSE_EVENTS.NODE_STARTED, {
      nodeId: node.id,
      nodeType: node.type,
      index,
      total: sorted.length,
    });

    try {
      const inputs = collectInputs(node, executableEdges, outputs);
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
          total: sorted.length,
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
          nodes,
          index,
          total: sorted.length,
          error: `${nodeLabel} 缺少必填输入: ${missingInputs.join(', ')}`,
          sendSSE,
        });
      }

      const result = await executor(node, inputs, apiConfig, (message) => {
        sendSSE(WORKFLOW_SSE_EVENTS.NODE_PROGRESS, {
          nodeId: node.id,
          progress: -1,
          message,
        });
      });

      outputs[node.id] = result;
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
        });
      }
      throw error;
    }
  }

  sendSSE(WORKFLOW_SSE_EVENTS.RUN_COMPLETED, {
    totalDuration: Date.now() - startTime,
    successCount,
    failCount,
  });
}
