import type { Node } from '@xyflow/react';

export type NodePosition = { x: number; y: number };

export function getNodeParentId(node: Node | undefined) {
  return (node as (Node & { parentId?: string }) | undefined)?.parentId;
}

export function getAbsoluteNodePosition(
  nodeId: string,
  nodeMap: Map<string, Node>,
  memo = new Map<string, NodePosition>(),
): NodePosition {
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodeMap.get(nodeId);
  if (!node) {
    const fallback = { x: 0, y: 0 };
    memo.set(nodeId, fallback);
    return fallback;
  }

  let position = { x: node.position.x, y: node.position.y };
  const parentId = getNodeParentId(node);
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

export function collectDescendantIds(nodes: Node[], rootIds: Iterable<string>) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = getNodeParentId(node);
    if (!parentId) continue;
    const children = byParent.get(parentId) || [];
    children.push(node.id);
    byParent.set(parentId, children);
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
  return visited;
}

export function expandNodeIdsWithDescendants(nodes: Node[], nodeIds: Iterable<string>) {
  const existingIds = new Set(nodes.map((node) => node.id));
  const rootIds = [...new Set(nodeIds)].filter((id) => existingIds.has(id));
  if (rootIds.length === 0) return [];
  return [...new Set([...rootIds, ...collectDescendantIds(nodes, rootIds)])];
}
