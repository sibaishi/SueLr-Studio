import { GRID_SIZE, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { expandNodeIdsWithDescendants, getAbsoluteNodePosition } from '@/domains/workflow/lib/graphHierarchy';
import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import { getCenteredPosition } from './flowCanvasHelpers';
import type { ClipboardSnapshot } from './flowCanvasTypes';

export function getDropNodePosition(nodeType: string, flowPosition: { x: number; y: number }, index: number) {
  const base = getCenteredPosition(nodeType, flowPosition);
  return {
    x: base.x + index * 28,
    y: base.y + index * 28,
  };
}

export function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function buildClipboardSnapshot(
  nodes: FlowNodeType[],
  edges: Edge[],
  nodeIds: string[],
): ClipboardSnapshot | null {
  const expandedIds = expandNodeIdsWithDescendants(nodes, nodeIds);
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
      const nextPosition = parentId && selectedSet.has(parentId) ? { ...node.position } : absolutePosition;
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
  const width =
    typeof node.width === 'number' ? node.width : typeof style.width === 'number' ? style.width : fallbackSize.w;
  const height =
    typeof node.height === 'number' ? node.height : typeof style.height === 'number' ? style.height : fallbackSize.h;
  const position = getAbsoluteNodePosition(node.id, nodeMap);

  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}
