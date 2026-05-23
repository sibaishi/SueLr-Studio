import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import { GRID_SIZE, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { getCenteredPosition } from './flowCanvasHelpers';
import type { ClipboardSnapshot } from './flowCanvasTypes';

export function getDropNodePosition(
  nodeType: string,
  flowPosition: { x: number; y: number },
  index: number,
) {
  const base = getCenteredPosition(nodeType, flowPosition);
  return {
    x: base.x + index * 28,
    y: base.y + index * 28,
  };
}

export function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function getAbsoluteNodePosition(
  nodeId: string,
  nodeMap: Map<string, FlowNodeType>,
  memo = new Map<string, { x: number; y: number }>(),
) {
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodeMap.get(nodeId);
  if (!node) {
    const fallback = { x: 0, y: 0 };
    memo.set(nodeId, fallback);
    return fallback;
  }

  let position = { x: node.position.x, y: node.position.y };
  const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
  if (parentId && nodeMap.has(parentId)) {
    const parentPosition = getAbsoluteNodePosition(parentId, nodeMap, memo);
    position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
  }

  memo.set(nodeId, position);
  return position;
}

function getDescendantIds(nodes: FlowNodeType[], rootIds: string[]) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
    if (!parentId) continue;
    const current = byParent.get(parentId) || [];
    current.push(node.id);
    byParent.set(parentId, current);
  }

  const visited = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    for (const childId of byParent.get(currentId) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return [...visited];
}

function expandSelectionIds(nodes: FlowNodeType[], nodeIds: string[]) {
  const uniqueIds = [...new Set(nodeIds)];
  return [...new Set([...uniqueIds, ...getDescendantIds(nodes, uniqueIds)])];
}

export function buildClipboardSnapshot(
  nodes: FlowNodeType[],
  edges: Edge[],
  nodeIds: string[],
): ClipboardSnapshot | null {
  const expandedIds = expandSelectionIds(nodes, nodeIds);
  if (expandedIds.length === 0) return null;

  const selectedSet = new Set(expandedIds);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  const snapshotNodes = nodes
    .filter((node) => selectedSet.has(node.id))
    .map((node) => {
      const absolutePosition = getAbsoluteNodePosition(node.id, nodeMap, positionMemo);
      const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
      const nextPosition = parentId && selectedSet.has(parentId)
        ? { ...node.position }
        : absolutePosition;
      minX = Math.min(minX, absolutePosition.x);
      minY = Math.min(minY, absolutePosition.y);
      return {
        ...node,
        position: nextPosition,
        parentId,
      } as FlowNodeType;
    });

  if (snapshotNodes.length === 0) return null;

  return {
    nodes: snapshotNodes,
    edges: edges
      .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
      })),
    bounds: {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
    },
  };
}

export function snapNodeBox(node: FlowNodeType): FlowNodeType {
  const nodeType = node.type || '';
  const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
  const minSize = getNodeDefaultSize(nodeType, inputCount);
  const currentWidth = typeof node.width === 'number' ? node.width : minSize.w;
  const currentHeight = typeof node.height === 'number' ? node.height : minSize.h;
  const width = Math.max(minSize.w, snapValue(currentWidth));
  const height = Math.max(minSize.h, snapValue(currentHeight));

  return {
    ...node,
    position: {
      x: snapValue(node.position.x),
      y: snapValue(node.position.y),
    },
    width,
    height,
  };
}

export function getNodeRenderRect(node: FlowNodeType, nodeMap: Map<string, FlowNodeType>) {
  const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
  const fallbackSize = getNodeDefaultSize(node.type || '', inputCount);
  const style = (node.style || {}) as Record<string, unknown>;
  const width = typeof node.width === 'number'
    ? node.width
    : typeof style.width === 'number' ? style.width : fallbackSize.w;
  const height = typeof node.height === 'number'
    ? node.height
    : typeof style.height === 'number' ? style.height : fallbackSize.h;
  const position = getAbsoluteNodePosition(node.id, nodeMap);

  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}
