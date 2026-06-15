import { GRID_SIZE, NODE_REGISTRY } from '@/domains/workflow/lib/constants';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';
import type { Edge, Node } from '@xyflow/react';

const AI_TYPES = ['aiV3'];
const OUTPUT_NODE_TYPES = new Set(['io']);
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

// ── Mode-aware input slot filtering for aiV3 ──

const AI_V3_MODE_INPUT_LIMITS: Record<string, Record<string, number>> = {
  chat: { text: Infinity, image: 9 },
  image: { text: Infinity, image: 9 },
  video: { text: Infinity, image: 2, video: 1, audio: 1 },
};

export interface AiV3InputSlot {
  id: string;         // unique slot id: edgeId or edgeId+'/text' or edgeId+'/f'+fileId
  edgeId: string;
  type: 'text' | 'image' | 'video' | 'audio';
  sourceNodeId: string;
  sourceNodeType: string;
  fileIdx?: number;   // index in IO _fileIds array (only for IO file slots)
  fileId?: number;    // raw fileId from IO _fileIds (only for IO file slots)
}

export interface AiV3FilterResult {
  acceptedSlots: AiV3InputSlot[];
  acceptedEdgeIds: Set<string>;
  /** edgeId → Set of accepted _fileIds indices (0-based) for IO _rawContent trimming */
  acceptedIoFileIndices: Map<string, Set<number>>;
}

function classifyInputEdgeSource(edge: Edge, nodes: Node[]): string {
  const src = nodes.find((n) => n.id === edge.source);
  if (!src) return 'text';
  const srcType = src.type || '';
  const handle = edge.sourceHandle || '';

  if (handle.includes('mask') || srcType === 'maskInput') return 'mask';
  if (
    handle.includes('video') ||
    (srcType.toLowerCase().includes('video') && !srcType.toLowerCase().includes('videogen'))
  )
    return 'video';
  if (handle.includes('audio') || srcType.toLowerCase().includes('audio')) return 'audio';
  if (handle.includes('image') || srcType.toLowerCase().includes('image')) return 'image';
  return 'text';
}

export function expandAiV3InputSlots(nodeId: string, edges: Edge[], nodes: Node[]): AiV3InputSlot[] {
  const inputEdges = edges.filter((e) => e.target === nodeId && e.targetHandle === 'input');
  const slots: AiV3InputSlot[] = [];

  for (const edge of inputEdges) {
    const src = nodes.find((n) => n.id === edge.source);
    if (!src) continue;

    if (src.type === 'io') {
      const data = (src.data || {}) as Record<string, unknown>;
      const text = typeof data.text === 'string' ? data.text : '';
      const fileKinds: string[] = Array.isArray(data._fileKinds) ? (data._fileKinds as string[]) : [];
      const fileIds: number[] = Array.isArray(data._fileIds) ? (data._fileIds as number[]) : [];
      const fileOrder: number[] = Array.isArray(data._fileOrder) ? (data._fileOrder as number[]) : [];

      // Sort file entries by fileOrder, then by array position
      const orderMap = new Map(fileOrder.map((fid, i) => [fid, i]));
      const sortedFileEntries = fileIds
        .map((fid, idx) => ({ fid, idx, order: orderMap.get(fid) ?? 9999 }))
        .sort((a, b) => a.order - b.order || a.idx - b.idx);

      // Text slot (always first within this edge's group)
      if (text) {
        slots.push({
          id: `${edge.id}/text`,
          edgeId: edge.id,
          type: 'text',
          sourceNodeId: src.id,
          sourceNodeType: 'io',
        });
      }

      // File slots
      for (const { fid, idx } of sortedFileEntries) {
        const kind = fileKinds[idx] || 'other';
        let slotType: AiV3InputSlot['type'] | null = null;
        if (kind === 'image') slotType = 'image';
        else if (kind === 'video') slotType = 'video';
        else if (kind === 'audio') slotType = 'audio';
        if (!slotType) continue;

        slots.push({
          id: `${edge.id}/f${fid}`,
          edgeId: edge.id,
          type: slotType,
          sourceNodeId: src.id,
          sourceNodeType: 'io',
          fileIdx: idx,
          fileId: fid,
        });
      }
    } else {
      const type = classifyInputEdgeSource(edge, nodes);
      if (type === 'mask') continue;
      slots.push({
        id: edge.id,
        edgeId: edge.id,
        type: type as AiV3InputSlot['type'],
        sourceNodeId: src.id,
        sourceNodeType: src.type || '',
      });
    }
  }

  return slots;
}

function sortSlotsByInputOrder(slots: AiV3InputSlot[], inputOrder: string[]): AiV3InputSlot[] {
  const orderMap = new Map(inputOrder.map((id, i) => [id, i]));

  return [...slots].sort((a, b) => {
    // Primary: edge's position in inputOrder
    const ai = orderMap.get(a.edgeId);
    const bi = orderMap.get(b.edgeId);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;

    // Same edge: text before files, files by fileIdx / fileId
    if (a.edgeId === b.edgeId) {
      if (a.type === 'text' && b.type !== 'text') return -1;
      if (a.type !== 'text' && b.type === 'text') return 1;
      const fa = a.fileIdx ?? 0;
      const fb = b.fileIdx ?? 0;
      return fa - fb;
    }

    return 0;
  });
}

/**
 * Expand IO nodes into individual slots and filter by mode-aware per-type caps.
 * Slots of types not in the mode's limits table (e.g. mask) are silently dropped.
 * Within each type, slots are accepted in inputOrder priority; excess slots
 * beyond a type's cap are silently ignored.
 */
export function filterAiV3InputSlots(
  nodeId: string,
  mode: string,
  edges: Edge[],
  nodes: Node[],
): AiV3FilterResult {
  const limits = AI_V3_MODE_INPUT_LIMITS[mode];
  const slots = expandAiV3InputSlots(nodeId, edges, nodes);

  if (!limits) {
    const allEdgeIds = new Set(slots.map((s) => s.edgeId));
    return { acceptedSlots: slots, acceptedEdgeIds: allEdgeIds, acceptedIoFileIndices: new Map() };
  }

  const targetNode = nodes.find((n) => n.id === nodeId);
  const inputOrder: string[] = Array.isArray(targetNode?.data?.inputOrder)
    ? (targetNode.data.inputOrder as string[])
    : [];
  const sorted = sortSlotsByInputOrder(slots, inputOrder);

  const counts: Record<string, number> = {};
  const acceptedSlots: AiV3InputSlot[] = [];

  for (const slot of sorted) {
    const limit = limits[slot.type];
    if (limit === undefined) continue;
    counts[slot.type] = (counts[slot.type] || 0) + 1;
    if (counts[slot.type] <= limit) {
      acceptedSlots.push(slot);
    }
  }

  const acceptedEdgeIds = new Set(acceptedSlots.map((s) => s.edgeId));
  const acceptedIoFileIndices = new Map<string, Set<number>>();
  for (const slot of acceptedSlots) {
    if (slot.fileIdx !== undefined) {
      const set = acceptedIoFileIndices.get(slot.edgeId) || new Set();
      set.add(slot.fileIdx);
      acceptedIoFileIndices.set(slot.edgeId, set);
    }
  }

  return { acceptedSlots, acceptedEdgeIds, acceptedIoFileIndices };
}

/**
 * Legacy wrapper: filter edges by mode, returning only accepted edges.
 * For IO nodes, the edge is accepted if at least one of its slots passes.
 */
export function filterAiV3InputEdgesByMode(
  nodeId: string,
  mode: string,
  edges: Edge[],
  nodes: Node[],
): Edge[] {
  const { acceptedEdgeIds } = filterAiV3InputSlots(nodeId, mode, edges, nodes);
  return edges.filter(
    (e) => e.target === nodeId && e.targetHandle === 'input' && acceptedEdgeIds.has(e.id),
  );
}
