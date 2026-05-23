import type { Node } from '@xyflow/react';
import { getNodeDefaultSize, GRID_SIZE } from '@/domains/workflow/lib/constants';
import { getGroupPorts } from '@/domains/workflow/lib/groupPorts';

export const GROUP_SAFE_MARGIN = GRID_SIZE;
export const GROUP_HEADER_HEIGHT = GRID_SIZE * 2;
export const GROUP_PORT_ROW_HEIGHT = 36;
export const GROUP_PORT_ROW_GAP = 6;
export const GROUP_PORT_SECTION_PADDING = 8;
export const GROUP_CONTENT_INSET_X = 12;
export const GROUP_CONTENT_INSET_BOTTOM = 12;
const GROUP_COLLAPSED_FRAME_PADDING = 8;
const GROUP_COLLAPSED_STACK_GAP = 6;
const GROUP_COLLAPSED_HEADER_HEIGHT = 68;
const GROUP_COLLAPSED_PORT_SECTION_BORDER = 2;
const GROUP_COLLAPSED_PORT_SECTION_PADDING = 6;
const GROUP_COLLAPSED_PORT_ROW_HEIGHT = 38;
const GROUP_COLLAPSED_PORT_ROW_GAP = 4;
const GROUP_COLLAPSED_META_HEIGHT = 18;
const GROUP_COLLAPSED_META_MARGIN_TOP = 2;
const GROUP_COLLAPSED_BOTTOM_SAFE_GAP = 10;
const GROUP_EXCLUSION_MARGIN = GROUP_SAFE_MARGIN;

function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapUpValue(value: number) {
  return Math.ceil(value / GRID_SIZE) * GRID_SIZE;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getEffectiveNodeSize(node: Node) {
  if (node.type === 'group' && node.data?.collapsed) {
    return getCollapsedGroupNodeSize(node);
  }

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
  const minX = GROUP_CONTENT_INSET_X;
  const minY = getGroupTopInset(groupNode);
  const maxX = Math.max(minX, groupSize.width - GROUP_CONTENT_INSET_X - childSize.width);
  const maxY = Math.max(minY, groupSize.height - GROUP_CONTENT_INSET_BOTTOM - childSize.height);
  return { minX, minY, maxX, maxY };
}

function getGroupVisiblePortRowCount(groupNode?: Pick<Node, 'data'>) {
  const data = (groupNode?.data || {}) as Record<string, unknown>;
  const inputCount = getGroupPorts(data, 'input').length || 1;
  const outputCount = getGroupPorts(data, 'output').length || 1;
  return Math.max(inputCount, outputCount, 1);
}

function getGroupPortSectionHeight(groupNode?: Pick<Node, 'data'>) {
  const rowCount = getGroupVisiblePortRowCount(groupNode);
  return GROUP_PORT_SECTION_PADDING * 2 + rowCount * GROUP_PORT_ROW_HEIGHT + Math.max(0, rowCount - 1) * GROUP_PORT_ROW_GAP;
}

export function getGroupTopInset(groupNode?: Pick<Node, 'data'>) {
  if (!groupNode) {
    return GROUP_HEADER_HEIGHT + GROUP_SAFE_MARGIN;
  }
  return snapValue(GROUP_HEADER_HEIGHT + getGroupPortSectionHeight(groupNode) + GROUP_SAFE_MARGIN);
}

export function getCollapsedGroupNodeSize(node: Pick<Node, 'data'>) {
  const visibleRows = getGroupVisiblePortRowCount(node);
  const portSectionHeight =
    GROUP_COLLAPSED_PORT_SECTION_BORDER
    + GROUP_COLLAPSED_PORT_SECTION_PADDING * 2
    + visibleRows * GROUP_COLLAPSED_PORT_ROW_HEIGHT
    + Math.max(0, visibleRows - 1) * GROUP_COLLAPSED_PORT_ROW_GAP;
  const contentHeight =
    GROUP_COLLAPSED_FRAME_PADDING * 2
    + GROUP_COLLAPSED_HEADER_HEIGHT
    + portSectionHeight
    + GROUP_COLLAPSED_META_HEIGHT
    + GROUP_COLLAPSED_META_MARGIN_TOP
    + GROUP_COLLAPSED_BOTTOM_SAFE_GAP
    + GROUP_COLLAPSED_STACK_GAP * 2;

  return {
    width: GRID_SIZE * 12,
    height: Math.max(GRID_SIZE * 6, snapUpValue(contentHeight)),
  };
}

export function constrainChildNodeSizeToGroupContent<T extends Node>(node: T, groupNode: Node): T {
  if (groupNode.data?.collapsed) return node;

  const groupSize = getEffectiveNodeSize(groupNode);
  const maxWidth = Math.max(GRID_SIZE * 2, groupSize.width - GROUP_CONTENT_INSET_X * 2);
  const maxHeight = Math.max(
    GRID_SIZE * 2,
    groupSize.height - getGroupTopInset(groupNode) - GROUP_CONTENT_INSET_BOTTOM,
  );
  const currentSize = getEffectiveNodeSize(node);

  return {
    ...node,
    width: Math.min(currentSize.width, maxWidth),
    height: Math.min(currentSize.height, maxHeight),
  } as T;
}

export function constrainChildNodeToGroupContent<T extends Node>(node: T, groupNode: Node): T {
  if (groupNode.data?.collapsed) {
    if ((node as Node & { extent?: unknown }).extent === 'parent') return node;
    return {
      ...node,
      extent: 'parent',
    } as T;
  }

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
