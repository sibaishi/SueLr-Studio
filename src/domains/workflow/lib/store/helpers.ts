import { GRID_SIZE, NODE_REGISTRY } from '@/domains/workflow/lib/constants';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';
import type { Edge, Node } from '@xyflow/react';

const AI_TYPES = ['aiV3'];
const OUTPUT_NODE_TYPES = new Set(['output', 'saveFile', 'textInput']);
const FORCE_DISABLED_NODE_TYPES = new Set<string>();
const LOG_DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;charset=[^;,]+)?;base64,/i;
const LOG_DATA_URL_PREVIEW_LENGTH = 48;
const LOG_MAX_STRING_LENGTH = 6000;
const LOG_MAX_JSON_LENGTH = 12000;
const LOG_TRUNCATED_HEAD_LENGTH = 2400;
const LOG_TRUNCATED_TAIL_LENGTH = 800;
const LOG_MAX_ARRAY_ITEMS = 24;
const LOG_MAX_OBJECT_ENTRIES = 48;
const LOG_MAX_DEPTH = 6;

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
  return getNodeDisplayName(
    nodes.find((node) => node.id === nodeId),
    nodes,
  );
}

function summarizeInlineDataUrl(value: string): string {
  const match = value.match(LOG_DATA_URL_PREFIX);
  if (!match) return value;

  return JSON.stringify({
    kind: 'inline-data-url',
    mimeType: match[1] || 'application/octet-stream',
    encoding: 'base64',
    length: value.length,
    preview: `${value.slice(0, LOG_DATA_URL_PREVIEW_LENGTH)}...`,
  });
}

function truncateLogText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return [
    value.slice(0, LOG_TRUNCATED_HEAD_LENGTH),
    `...[truncated ${value.length - LOG_TRUNCATED_HEAD_LENGTH - LOG_TRUNCATED_TAIL_LENGTH} chars]...`,
    value.slice(-LOG_TRUNCATED_TAIL_LENGTH),
  ].join('\n');
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    const summarized = value.startsWith('data:') ? summarizeInlineDataUrl(value) : value;
    return truncateLogText(summarized, LOG_MAX_STRING_LENGTH);
  }

  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (depth >= LOG_MAX_DEPTH) return `[truncated depth=${LOG_MAX_DEPTH}]`;

  if (Array.isArray(value)) {
    const items = value.slice(0, LOG_MAX_ARRAY_ITEMS).map((item) => sanitizeLogValue(item, depth + 1));
    if (value.length > LOG_MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - LOG_MAX_ARRAY_ITEMS} more items truncated]`);
    }
    return items;
  }

  const entries = Object.entries(value);
  const nextEntries = entries
    .slice(0, LOG_MAX_OBJECT_ENTRIES)
    .map(([key, nestedValue]) => [key, sanitizeLogValue(nestedValue, depth + 1)]);
  if (entries.length > LOG_MAX_OBJECT_ENTRIES) {
    nextEntries.push(['__truncatedEntries', entries.length - LOG_MAX_OBJECT_ENTRIES]);
  }
  return Object.fromEntries(nextEntries);
}

export function sanitizeLogMessage(message: unknown): string {
  const safeValue = sanitizeLogValue(typeof message === 'string' ? message : String(message));
  return typeof safeValue === 'string' ? safeValue : String(safeValue);
}

export function formatLogDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === 'string') return sanitizeLogMessage(details);
  try {
    return truncateLogText(JSON.stringify(sanitizeLogValue(details), null, 2), LOG_MAX_JSON_LENGTH);
  } catch {
    return sanitizeLogMessage(details);
  }
}

export function sanitizeNodeData(nodeType: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object') return getDefaultData(nodeType);

  const nextData = { ...getDefaultData(nodeType), ...data };
  nextData.videoMode = undefined;
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

    return [
      {
        id: record.id,
        type: record.type,
        position: { x, y },
        width:
          typeof uiRecord?.width === 'number'
            ? (uiRecord.width as number)
            : typeof record.width === 'number'
              ? record.width
              : undefined,
        height:
          typeof uiRecord?.height === 'number'
            ? (uiRecord.height as number)
            : typeof record.height === 'number'
              ? record.height
              : undefined,
        parentId:
          typeof uiRecord?.parentId === 'string'
            ? (uiRecord.parentId as string)
            : typeof record.parentId === 'string'
              ? record.parentId
              : undefined,
        extent:
          uiRecord?.extent === 'parent' ||
          record.extent === 'parent' ||
          (Array.isArray(record.extent) &&
            record.extent.length === 2 &&
            Array.isArray(record.extent[0]) &&
            Array.isArray(record.extent[1]))
            ? (record.extent as Node['extent'])
            : undefined,
        data: {
          ...sanitizeNodeData(
            record.type,
            record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {},
          ),
        },
      },
    ];
  });
}

export function normalizeEdges(input: unknown, validNodeIds: Set<string>): Edge[] {
  if (!Array.isArray(input)) return [];

  const seenIds = new Set<string>();
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.source !== 'string' || typeof record.target !== 'string') return [];
    if (!validNodeIds.has(record.source) || !validNodeIds.has(record.target)) return [];
    let id = typeof record.id === 'string' && record.id ? record.id : `edge_${gid()}`;
    if (seenIds.has(id)) {
      do {
        id = `edge_${gid()}`;
      } while (seenIds.has(id));
    }
    seenIds.add(id);

    return [
      {
        id,
        source: record.source,
        sourceHandle: typeof record.sourceHandle === 'string' ? record.sourceHandle : null,
        target: record.target,
        targetHandle: typeof record.targetHandle === 'string' ? record.targetHandle : null,
        type: 'smoothstep',
        animated: false,
        style: { strokeWidth: 2 },
      },
    ];
  });
}

export function buildWorkflowPayload(
  workflowId: string,
  workflowName: string,
  nodes: Node[],
  edges: Edge[],
): PersistedWorkflow {
  const seenEdgeIds = new Set<string>();
  const persistedEdges = edges.map((edge) => {
    let id = edge.id || `edge_${gid()}`;
    if (seenEdgeIds.has(id)) {
      do {
        id = `edge_${gid()}`;
      } while (seenEdgeIds.has(id));
    }
    seenEdgeIds.add(id);

    return {
      id,
      source: edge.source,
      ...(typeof edge.sourceHandle === 'string' ? { sourceHandle: edge.sourceHandle } : {}),
      target: edge.target,
      ...(typeof edge.targetHandle === 'string' ? { targetHandle: edge.targetHandle } : {}),
    };
  });

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
        ...((node as Node & { parentId?: string }).parentId
          ? { parentId: (node as Node & { parentId?: string }).parentId }
          : {}),
        ...(typeof (node as Node & { extent?: unknown }).extent === 'string'
          ? { extent: (node as Node & { extent?: string }).extent }
          : {}),
      },
    })),
    edges: persistedEdges,
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

  const activeAiNodes = nodes.filter((node) => AI_TYPES.includes(node.type || '') && !node.data?.disabled);

  return activeAiNodes.filter((aiNode) => {
    const visited = new Set<string>();
    const queue = [...(adjacency.get(aiNode.id) || [])];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodeById.get(currentId);
      if (!currentNode) continue;

      if (OUTPUT_NODE_TYPES.has(currentNode.type || '') && !currentNode.data?.disabled) {
        return false;
      }

      for (const nextId of adjacency.get(currentId) || []) {
        queue.push(nextId);
      }
    }

    return true;
  });
}
