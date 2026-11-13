const RETIRED_NODE_TYPES = new Set(['promptHelper', 'materialProcess']);

/**
 * @template T
 * @param {T} workflow
 * @returns {T}
 */
export function omitRetiredWorkflowNodes(workflow) {
  if (!workflow || typeof workflow !== 'object' || !('nodes' in workflow) || !Array.isArray(workflow.nodes)) {
    return workflow;
  }

  const retired = workflow.nodes.filter((node) => RETIRED_NODE_TYPES.has(node?.type));
  if (retired.length === 0) return workflow;

  const retiredIds = new Set(retired.map((node) => node.id).filter((id) => typeof id === 'string'));
  const nodes = workflow.nodes.filter((node) => !RETIRED_NODE_TYPES.has(node?.type));
  const edges = 'edges' in workflow && Array.isArray(workflow.edges)
    ? workflow.edges.filter((edge) => !retiredIds.has(edge?.source) && !retiredIds.has(edge?.target))
    : undefined;
  return { ...workflow, nodes, ...(edges ? { edges } : {}) };
}
