import type { Edge, Node } from '@xyflow/react';
import { findGroupPort, parseGroupHandleId } from '@/features/workflow/lib/groupPorts';

function getNodeParentId(node: Node) {
  return (node as Node & { parentId?: string }).parentId;
}

function getAbsoluteNodePosition(
  nodeId: string,
  nodeMap: Map<string, Node>,
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

type ResolvedEndpoint = {
  nodeId: string;
  handleId: string;
};

function resolveExecutionSources(
  nodeMap: Map<string, Node>,
  nodeId: string,
  handleId: string | null | undefined,
  visited = new Set<string>(),
): ResolvedEndpoint[] {
  if (!handleId) return [];

  const node = nodeMap.get(nodeId);
  if (!node) return [];
  if (node.type !== 'group') {
    return [{ nodeId, handleId }];
  }

  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor || descriptor.side !== 'output' || descriptor.role !== 'external') {
    return [];
  }

  const visitKey = `${nodeId}:${handleId}:source`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);

  const port = findGroupPort((node.data || {}) as Record<string, unknown>, 'output', descriptor.portId);
  if (!port) return [];

  const resolvedSources: ResolvedEndpoint[] = [];
  for (const insideLink of port.insideLinks) {
    resolvedSources.push(
      ...resolveExecutionSources(nodeMap, insideLink.nodeId, insideLink.handleId, visited),
    );
  }

  return resolvedSources;
}

function resolveExecutionTargets(
  nodeMap: Map<string, Node>,
  nodeId: string,
  handleId: string | null | undefined,
  visited = new Set<string>(),
): ResolvedEndpoint[] {
  if (!handleId) return [];

  const node = nodeMap.get(nodeId);
  if (!node) return [];
  if (node.type !== 'group') {
    return [{ nodeId, handleId }];
  }

  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor || descriptor.side !== 'input' || descriptor.role !== 'external') {
    return [];
  }

  const visitKey = `${nodeId}:${handleId}:target`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);

  const port = findGroupPort((node.data || {}) as Record<string, unknown>, 'input', descriptor.portId);
  if (!port) return [];

  const resolvedTargets: ResolvedEndpoint[] = [];
  for (const insideLink of port.insideLinks) {
    resolvedTargets.push(
      ...resolveExecutionTargets(nodeMap, insideLink.nodeId, insideLink.handleId, visited),
    );
  }

  return resolvedTargets;
}

export function projectWorkflowToExecutionGraph(nodes: Node[], edges: Edge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();

  const projectedNodes = nodes
    .filter((node) => node.type !== 'group')
    .map((node) => {
      const absolutePosition = getAbsoluteNodePosition(node.id, nodeMap, positionMemo);
      return {
        ...node,
        position: absolutePosition,
        parentId: undefined,
        extent: undefined,
      } satisfies Node;
    });

  const seenEdges = new Set<string>();
  const projectedEdges: Edge[] = [];

  for (const edge of edges) {
    const sources = resolveExecutionSources(nodeMap, edge.source, edge.sourceHandle);
    const targets = resolveExecutionTargets(nodeMap, edge.target, edge.targetHandle);
    if (sources.length === 0 || targets.length === 0) continue;

    for (const source of sources) {
      for (const target of targets) {
        const dedupeKey = `${source.nodeId}:${source.handleId}->${target.nodeId}:${target.handleId}`;
        if (seenEdges.has(dedupeKey)) continue;
        seenEdges.add(dedupeKey);

        projectedEdges.push({
          ...edge,
          source: source.nodeId,
          sourceHandle: source.handleId,
          target: target.nodeId,
          targetHandle: target.handleId,
        });
      }
    }
  }

  return {
    nodes: projectedNodes,
    edges: projectedEdges,
  };
}
