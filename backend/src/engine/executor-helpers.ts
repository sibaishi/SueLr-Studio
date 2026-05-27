import { WORKFLOW_SSE_EVENTS } from '../platform/logging/workflow-events.ts';
import { getNodeTypeLabel } from './contracts/node-registry.ts';
import type { DynamicValue, WorkflowNode } from './nodes/types.ts';

type WorkflowEdge = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

type WorkflowOutputs = Record<string, Record<string, DynamicValue> | undefined>;

type SendSSE = (event: string, data: Record<string, DynamicValue>) => unknown;

export function getNodeDisplayName(node: WorkflowNode | undefined, nodes: WorkflowNode[]): string {
  if (!node) return '未知节点';
  const baseLabel = getNodeTypeLabel(String(node.type || ''));
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  if (sameTypeNodes.length <= 1) return baseLabel;
  const index = sameTypeNodes.findIndex((item) => item.id === node.id);
  return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
}

export function failWorkflowAtNode({
  node,
  nodes,
  index,
  total,
  error,
  sendSSE,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  index: number;
  total: number;
  error: string;
  sendSSE: SendSSE;
}): never {
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
  const terminationError = new Error(error || `${nodeLabel} 执行失败`) as Error & {
    workflowTerminated?: boolean;
    nodeErrorAlreadySent?: boolean;
  };
  terminationError.workflowTerminated = true;
  terminationError.nodeErrorAlreadySent = true;
  throw terminationError;
}

export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], supportedTypes: Set<string>): void {
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
    if (!supportedTypes.has(String(node.type || ''))) {
      throw new Error(`不支持的节点类型: ${node.type}`);
    }
  }
}

export function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  nodes.forEach((node) => {
    if (!node.id) return;
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    if (adjacency[edge.source]) {
      adjacency[edge.source].push(edge.target);
    }
  });

  const queue = nodes.filter((node) => node.id && inDegree[node.id] === 0).map((node) => String(node.id));
  const result: WorkflowNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodes.find((item) => item.id === nodeId);
    if (node) result.push(node);

    for (const target of adjacency[String(nodeId)] || []) {
      inDegree[target] -= 1;
      if (inDegree[target] === 0) {
        queue.push(target);
      }
    }
  }

  if (result.length !== nodes.length) {
    throw new Error('工作流中存在循环依赖，请检查节点连线');
  }

  return result;
}

function resolveLegacyOutputAlias(sourceOutput: Record<string, DynamicValue> | undefined, sourceHandle?: string) {
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

export function collectInputs(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  outputs: WorkflowOutputs,
): Record<string, DynamicValue> {
  const inputs: Record<string, DynamicValue> = {};
  edges
    .filter((edge) => edge.target === node.id)
    .forEach((edge) => {
      const sourceOutput = outputs[edge.source];
      if (sourceOutput) {
        const sourceHandle = edge.sourceHandle || '';
        const targetHandle = edge.targetHandle || '';
        const directValue = sourceOutput[sourceHandle];
        inputs[targetHandle] =
          directValue !== undefined ? directValue : resolveLegacyOutputAlias(sourceOutput, sourceHandle);
      }
    });
  return inputs;
}
