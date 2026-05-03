import type { Node } from '@xyflow/react';
import { getNodeDefaultSize, GRID_SIZE } from '@/features/workflow/lib/constants';

export const GROUP_SAFE_MARGIN = GRID_SIZE;
export const GROUP_HEADER_HEIGHT = GRID_SIZE * 2;
const GROUP_EXCLUSION_MARGIN = GROUP_SAFE_MARGIN;

function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getEffectiveNodeSize(node: Node) {
  const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
  const minSize = getNodeDefaultSize(node.type || '', inputCount);
  return {
    width: typeof node.width === 'number' ? Math.max(node.width, minSize.w) : minSize.w,
    height: typeof node.height === 'number' ? Math.max(node.height, minSize.h) : minSize.h,
  };
}

export function getGroupContentBounds(groupNode: Node, childNode?: Node) {
  const groupSize = getEffectiveNodeSize(groupNode);
  const childSize = childNode ? getEffectiveNodeSize(childNode) : { width: 0, height: 0 };
  const minX = GROUP_SAFE_MARGIN;
  const minY = GROUP_HEADER_HEIGHT + GROUP_SAFE_MARGIN;
  const maxX = Math.max(minX, groupSize.width - GROUP_SAFE_MARGIN - childSize.width);
  const maxY = Math.max(minY, groupSize.height - GROUP_SAFE_MARGIN - childSize.height);
  return { minX, minY, maxX, maxY };
}

export function getGroupTopInset() {
  return GROUP_HEADER_HEIGHT + GROUP_SAFE_MARGIN;
}

export function constrainChildNodeSizeToGroupContent<T extends Node>(node: T, groupNode: Node): T {
  const groupSize = getEffectiveNodeSize(groupNode);
  const maxWidth = Math.max(GRID_SIZE * 2, groupSize.width - GROUP_SAFE_MARGIN * 2);
  const maxHeight = Math.max(GRID_SIZE * 2, groupSize.height - GROUP_HEADER_HEIGHT - GROUP_SAFE_MARGIN * 2);
  const currentSize = getEffectiveNodeSize(node);

  return {
    ...node,
    width: Math.min(currentSize.width, maxWidth),
    height: Math.min(currentSize.height, maxHeight),
  } as T;
}

export function constrainChildNodeToGroupContent<T extends Node>(node: T, groupNode: Node): T {
  const sizedNode = constrainChildNodeSizeToGroupContent(node, groupNode);
  const bounds = getGroupContentBounds(groupNode, sizedNode);
  const nextPosition = {
    x: clamp(sizedNode.position.x, bounds.minX, bounds.maxX),
    y: clamp(sizedNode.position.y, bounds.minY, bounds.maxY),
  };

  if (
    nextPosition.x === sizedNode.position.x &&
    nextPosition.y === sizedNode.position.y &&
    (sizedNode as Node & { extent?: unknown }).extent === 'parent'
  ) {
    return sizedNode;
  }

  return {
    ...sizedNode,
    position: nextPosition,
    extent: 'parent',
  } as T;
}

export function pushRootNodeOutsideGroupAreas<T extends Node>(node: T, nodes: Node[]): T {
  const parentId = (node as Node & { parentId?: string }).parentId;
  if (parentId || node.type === 'group') return node;

  const nodeSize = getEffectiveNodeSize(node);
  const groupNodes = nodes.filter((item) => item.type === 'group' && item.id !== node.id);
  let nextPosition = { ...node.position };
  let changed = false;

  for (const group of groupNodes) {
    const groupSize = getEffectiveNodeSize(group);
    const left = group.position.x - GROUP_EXCLUSION_MARGIN;
    const top = group.position.y - GROUP_EXCLUSION_MARGIN;
    const right = group.position.x + groupSize.width + GROUP_EXCLUSION_MARGIN;
    const bottom = group.position.y + groupSize.height + GROUP_EXCLUSION_MARGIN;

    const overlaps =
      nextPosition.x < right &&
      nextPosition.x + nodeSize.width > left &&
      nextPosition.y < bottom &&
      nextPosition.y + nodeSize.height > top;

    if (!overlaps) continue;

    const moveLeft = Math.abs((nextPosition.x + nodeSize.width) - left);
    const moveRight = Math.abs(right - nextPosition.x);
    const moveUp = Math.abs((nextPosition.y + nodeSize.height) - top);
    const moveDown = Math.abs(bottom - nextPosition.y);
    const minMove = Math.min(moveLeft, moveRight, moveUp, moveDown);

    if (minMove === moveLeft) {
      nextPosition = { ...nextPosition, x: left - nodeSize.width };
    } else if (minMove === moveRight) {
      nextPosition = { ...nextPosition, x: right };
    } else if (minMove === moveUp) {
      nextPosition = { ...nextPosition, y: top - nodeSize.height };
    } else {
      nextPosition = { ...nextPosition, y: bottom };
    }

    changed = true;
  }

  if (!changed) return node;

  return {
    ...node,
    position: {
      x: snapValue(nextPosition.x),
      y: snapValue(nextPosition.y),
    },
  } as T;
}

export function enforceGroupLayout<T extends Node>(nodes: T[]): T[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const childrenConstrained = nodes.map((node) => {
    const parentId = (node as Node & { parentId?: string }).parentId;
    if (!parentId) return node;
    const parentNode = nodeMap.get(parentId);
    if (parentNode?.type !== 'group') return node;
    return constrainChildNodeToGroupContent(node, parentNode) as T;
  });

  return childrenConstrained.map((node) => pushRootNodeOutsideGroupAreas(node, childrenConstrained) as T);
}
