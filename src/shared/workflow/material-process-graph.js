export const MATERIAL_PROCESS_NODE_TYPE = 'materialProcess';

export function isIteratingMaterialProcessNode(node) {
  return node?.type === MATERIAL_PROCESS_NODE_TYPE && node?.data?.iterateEnabled === true;
}

export function findNestedMaterialProcessPath(nodes, edges) {
  const iteratingIds = new Set(nodes.filter(isIteratingMaterialProcessNode).map((node) => String(node.id || '')));
  if (iteratingIds.size < 2) return null;

  const adjacency = new Map(nodes.map((node) => [String(node.id || ''), []]));
  for (const edge of edges) {
    const targets = adjacency.get(String(edge.source || ''));
    if (targets) targets.push(String(edge.target || ''));
  }

  for (const sourceId of iteratingIds) {
    const visited = new Set([sourceId]);
    const queue = [...(adjacency.get(sourceId) || [])];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) continue;
      if (iteratingIds.has(nodeId)) return { sourceId, targetId: nodeId };
      visited.add(nodeId);
      queue.push(...(adjacency.get(nodeId) || []));
    }
  }

  return null;
}

export function wouldCreateNestedMaterialProcessPath(nodes, edges, edge) {
  return Boolean(findNestedMaterialProcessPath(nodes, [...edges, edge]));
}
