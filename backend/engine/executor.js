import { execute as executeTextInput } from './nodes/textInput.js';
import { execute as executeAiChat } from './nodes/aiChat.js';
import { execute as executeOutput } from './nodes/output.js';
import { execute as executeImageInput } from './nodes/imageInput.js';
import { execute as executeMaskInput } from './nodes/maskInput.js';
import { execute as executeImageResize } from './nodes/imageResize.js';
import { execute as executeVideoInput } from './nodes/videoInput.js';
import { execute as executeAudioInput } from './nodes/audioInput.js';
import { execute as executeApiKeyInput } from './nodes/apiKeyInput.js';
import { execute as executeTextMerge } from './nodes/textMerge.js';
import { execute as executeImageMerge } from './nodes/imageMerge.js';
import { execute as executeVideoMerge } from './nodes/videoMerge.js';
import { execute as executeAudioMerge } from './nodes/audioMerge.js';
import { execute as executeUniversalMerge } from './nodes/universalMerge.js';
import { execute as executeImageGen } from './nodes/imageGen.js';
import { execute as executeVideoGen } from './nodes/videoGen.js';
import { execute as executeSaveFile } from './nodes/saveFile.js';
import { getNodeTypeLabel, getRequiredInputs, isExecutableNodeType } from './contracts/node-registry.js';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.js';

const NODE_EXECUTORS = {
  textInput: executeTextInput,
  imageInput: executeImageInput,
  maskInput: executeMaskInput,
  imageResize: executeImageResize,
  videoInput: executeVideoInput,
  audioInput: executeAudioInput,
  apiKeyInput: executeApiKeyInput,
  textMerge: executeTextMerge,
  imageMerge: executeImageMerge,
  videoMerge: executeVideoMerge,
  audioMerge: executeAudioMerge,
  universalMerge: executeUniversalMerge,
  aiChat: executeAiChat,
  imageGen: executeImageGen,
  videoGen: executeVideoGen,
  saveFile: executeSaveFile,
  output: executeOutput,
};

function getNodeDisplayName(node, nodes) {
  if (!node) return '未知节点';
  const baseLabel = getNodeTypeLabel(node.type);
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  if (sameTypeNodes.length <= 1) return baseLabel;
  const index = sameTypeNodes.findIndex((item) => item.id === node.id);
  return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
}

function failWorkflowAtNode({
  node,
  nodes,
  index,
  total,
  error,
  sendSSE,
}) {
  const nodeLabel = getNodeDisplayName(node, nodes);
  sendSSE(WORKFLOW_SSE_EVENTS.NODE_STARTED, {
    nodeId: node.id,
    nodeType: node.type,
    index,
    total,
  });
  sendSSE(WORKFLOW_SSE_EVENTS.NODE_FAILED, {
    nodeId: node.id,
    error,
  });
  const terminationError = new Error(error || `${nodeLabel} 执行失败`);
  terminationError.workflowTerminated = true;
  terminationError.nodeErrorAlreadySent = true;
  throw terminationError;
}

export async function executeWorkflow(workflow, apiConfig, sendSSE) {
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
    validateWorkflow(executableNodes, executableEdges);
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

function validateWorkflow(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) {
    throw new Error('存在重复的节点 ID');
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`连线引用了不存在的源节点: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`连线引用了不存在的目标节点: ${edge.target}`);
    }
  }

  const supportedTypes = new Set(Object.keys(NODE_EXECUTORS));
  for (const node of nodes) {
    if (!supportedTypes.has(node.type)) {
      throw new Error(`不支持的节点类型: ${node.type}`);
    }
  }
}

function topoSort(nodes, edges) {
  const inDegree = {};
  const adjacency = {};

  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    if (adjacency[edge.source]) {
      adjacency[edge.source].push(edge.target);
    }
  });

  const queue = nodes.filter((node) => inDegree[node.id] === 0).map((node) => node.id);
  const result = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodes.find((item) => item.id === nodeId);
    if (node) result.push(node);

    (adjacency[nodeId] || []).forEach((target) => {
      inDegree[target] -= 1;
      if (inDegree[target] === 0) {
        queue.push(target);
      }
    });
  }

  if (result.length !== nodes.length) {
    throw new Error('工作流中存在循环依赖，请检查节点连线');
  }

  return result;
}

function collectInputs(node, edges, outputs) {
  const inputs = {};
  edges
    .filter((edge) => edge.target === node.id)
    .forEach((edge) => {
      const sourceOutput = outputs[edge.source];
      if (sourceOutput) {
        inputs[edge.targetHandle] = sourceOutput[edge.sourceHandle];
      }
    });
  return inputs;
}
