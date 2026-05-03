import type { Edge, Node } from '@xyflow/react';
import { GRID_SIZE, NODE_REGISTRY } from '@/features/workflow/lib/constants';
import type { PersistedWorkflow } from '@/domains/workflow/types';

const AI_TYPES = ['aiChat', 'imageGen', 'videoGen'];
const OUTPUT_NODE_TYPES = new Set(['output', 'saveFile']);
const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);

export function gid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function getDefaultData(nodeType: string): Record<string, unknown> {
  const def = NODE_REGISTRY.find((nodeDef) => nodeDef.type === nodeType);
  if (!def) return {};

  const data: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      data[param.id] = param.default;
    }
  }
  return data;
}

export function getNodeTypeLabel(nodeType: string): string {
  return NODE_REGISTRY.find((nodeDef) => nodeDef.type === nodeType)?.label || nodeType || '未知节点';
}

export function getNodeDisplayName(node: Pick<Node, 'id' | 'type'> | undefined, nodes: Node[]): string {
  if (!node) return '未知节点';
  const baseLabel = getNodeTypeLabel(node.type || '');
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  if (sameTypeNodes.length <= 1) return baseLabel;
  const index = sameTypeNodes.findIndex((item) => item.id === node.id);
  return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
}

export function getNodeDisplayNameById(nodeId: string, nodes: Node[]): string {
  return getNodeDisplayName(nodes.find((node) => node.id === nodeId), nodes);
}

export function formatLogDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function sanitizeNodeData(nodeType: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object') return getDefaultData(nodeType);

  const nextData = { ...getDefaultData(nodeType), ...data };
  delete nextData.videoMode;
  if (FORCE_DISABLED_NODE_TYPES.has(nodeType)) nextData.disabled = true;
  return nextData;
}

export function normalizeNodes(input: unknown): Node[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.type !== 'string') return [];

    const positionRecord = record.position as Record<string, unknown> | undefined;
    const uiRecord = record.ui as Record<string, unknown> | undefined;
    const x = typeof positionRecord?.x === 'number' ? positionRecord.x : 0;
    const y = typeof positionRecord?.y === 'number' ? positionRecord.y : 0;

    return [{
      id: record.id,
      type: record.type,
      position: { x, y },
      width: typeof uiRecord?.width === 'number'
        ? uiRecord.width as number
        : typeof record.width === 'number' ? record.width : undefined,
      height: typeof uiRecord?.height === 'number'
        ? uiRecord.height as number
        : typeof record.height === 'number' ? record.height : undefined,
      parentId: typeof uiRecord?.parentId === 'string'
        ? uiRecord.parentId as string
        : typeof record.parentId === 'string' ? record.parentId : undefined,
      extent:
        uiRecord?.extent === 'parent' ||
        record.extent === 'parent' ||
        (
          Array.isArray(record.extent) &&
          record.extent.length === 2 &&
          Array.isArray(record.extent[0]) &&
          Array.isArray(record.extent[1])
        )
          ? record.extent as Node['extent']
          : undefined,
      data: {
        ...sanitizeNodeData(
          record.type,
          record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {},
        ),
      },
    }];
  });
}

export function normalizeEdges(input: unknown, validNodeIds: Set<string>): Edge[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.source !== 'string' || typeof record.target !== 'string') return [];
    if (!validNodeIds.has(record.source) || !validNodeIds.has(record.target)) return [];

    return [{
      id: typeof record.id === 'string' ? record.id : `edge_${gid()}`,
      source: record.source,
      sourceHandle: typeof record.sourceHandle === 'string' ? record.sourceHandle : null,
      target: record.target,
      targetHandle: typeof record.targetHandle === 'string' ? record.targetHandle : null,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 2 },
    }];
  });
}

export function buildWorkflowPayload(
  workflowId: string,
  workflowName: string,
  nodes: Node[],
  edges: Edge[],
): PersistedWorkflow {
  return {
    id: workflowId,
    name: workflowName,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type || '',
      version: 1,
      position: node.position,
      data: sanitizeNodeData(node.type || '', node.data as Record<string, unknown>),
      ui: {
        ...(typeof node.width === 'number' ? { width: node.width } : {}),
        ...(typeof node.height === 'number' ? { height: node.height } : {}),
        ...((node as Node & { parentId?: string }).parentId ? { parentId: (node as Node & { parentId?: string }).parentId } : {}),
        ...(typeof (node as Node & { extent?: unknown }).extent === 'string' ? { extent: (node as Node & { extent?: string }).extent } : {}),
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      ...(typeof edge.sourceHandle === 'string' ? { sourceHandle: edge.sourceHandle } : {}),
      target: edge.target,
      ...(typeof edge.targetHandle === 'string' ? { targetHandle: edge.targetHandle } : {}),
    })),
    settings: {},
  };
}

export function getAiNodesMissingValidOutputs(nodes: Node[], edges: Edge[]) {
  const adjacency = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const current = adjacency.get(edge.source) || [];
    current.push(edge.target);
    adjacency.set(edge.source, current);
  }

  const activeAiNodes = nodes.filter((node) => AI_TYPES.includes(node.type || '') && !Boolean(node.data?.disabled));

  return activeAiNodes.filter((aiNode) => {
    const visited = new Set<string>();
    const queue = [...(adjacency.get(aiNode.id) || [])];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodeById.get(currentId);
      if (!currentNode) continue;

      if (OUTPUT_NODE_TYPES.has(currentNode.type || '') && !Boolean(currentNode.data?.disabled)) {
        return false;
      }

      for (const nextId of adjacency.get(currentId) || []) {
        queue.push(nextId);
      }
    }

    return true;
  });
}
