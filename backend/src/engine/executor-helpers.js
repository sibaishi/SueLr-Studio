import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.js';
import { getNodeTypeLabel } from './contracts/node-registry.js';

export function getNodeDisplayName(node, nodes) {
  if (!node) return '未知节点';
  const baseLabel = getNodeTypeLabel(node.type);
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  if (sameTypeNodes.length <= 1) return baseLabel;
  const index = sameTypeNodes.findIndex((item) => item.id === node.id);
  return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
}

export function failWorkflowAtNode({ node, nodes, index, total, error, sendSSE }) {
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

export function validateWorkflow(nodes, edges, supportedTypes) {
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

  for (const node of nodes) {
    if (!supportedTypes.has(node.type)) {
      throw new Error(`不支持的节点类型: ${node.type}`);
    }
  }
}

export function topoSort(nodes, edges) {
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

function resolveLegacyOutputAlias(sourceOutput, sourceHandle) {
  if (!sourceOutput || typeof sourceOutput !== 'object') return undefined;

  if (sourceHandle === 'image' && Array.isArray(sourceOutput.images)) {
    return sourceOutput.images[0];
  }

  if (sourceHandle === 'images' && sourceOutput.image !== undefined) {
    return Array.isArray(sourceOutput.image) ? sourceOutput.image : [sourceOutput.image];
  }

  if (sourceHandle === 'video' && Array.isArray(sourceOutput.videos)) {
    return sourceOutput.videos[0];
  }

  if (sourceHandle === 'videos' && sourceOutput.video !== undefined) {
    return Array.isArray(sourceOutput.video) ? sourceOutput.video : [sourceOutput.video];
  }

  if (sourceHandle === 'audio' && Array.isArray(sourceOutput.audios)) {
    return sourceOutput.audios[0];
  }

  if (sourceHandle === 'audios' && sourceOutput.audio !== undefined) {
    return Array.isArray(sourceOutput.audio) ? sourceOutput.audio : [sourceOutput.audio];
  }

  return undefined;
}

export function collectInputs(node, edges, outputs) {
  const inputs = {};
  edges
    .filter((edge) => edge.target === node.id)
    .forEach((edge) => {
      const sourceOutput = outputs[edge.source];
      if (sourceOutput) {
        const directValue = sourceOutput[edge.sourceHandle];
        inputs[edge.targetHandle] =
          directValue !== undefined ? directValue : resolveLegacyOutputAlias(sourceOutput, edge.sourceHandle);
      }
    });
  return inputs;
}
