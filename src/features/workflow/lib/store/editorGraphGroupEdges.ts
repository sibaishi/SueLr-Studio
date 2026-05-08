import type { Edge, Node } from '@xyflow/react';
import {
  buildGroupHandleId,
  findGroupPort,
  parseGroupHandleId,
  updateGroupPortList,
} from '@/features/workflow/lib/groupPorts';

export function collectCascadeRemovedGroupEdgeIds(nodes: Node[], edges: Edge[], removedEdges: Edge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const removedEdgeIds = new Set<string>();

  for (const removedEdge of removedEdges) {
    const sourceDescriptor = parseGroupHandleId(removedEdge.sourceHandle);
    if (
      sourceDescriptor
      && removedEdge.source
      && sourceDescriptor.side === 'input'
      && sourceDescriptor.role === 'internal'
    ) {
      const groupNode = nodeMap.get(removedEdge.source);
      const port = groupNode?.type === 'group'
        ? findGroupPort((groupNode.data || {}) as Record<string, unknown>, 'input', sourceDescriptor.portId)
        : null;
      const remainingInsideLinks = (port?.insideLinks || []).filter((link) => !(
        link.nodeId === removedEdge.target && link.handleId === removedEdge.targetHandle
      ));

      if (port && remainingInsideLinks.length === 0) {
        for (const edge of edges) {
          if (
            edge.target === removedEdge.source
            && edge.targetHandle === buildGroupHandleId('input', port.id, 'external')
          ) {
            removedEdgeIds.add(edge.id);
          }
        }
      }
    }

    const targetDescriptor = parseGroupHandleId(removedEdge.targetHandle);
    if (
      targetDescriptor
      && removedEdge.target
      && targetDescriptor.side === 'output'
      && targetDescriptor.role === 'internal'
    ) {
      const groupNode = nodeMap.get(removedEdge.target);
      const port = groupNode?.type === 'group'
        ? findGroupPort((groupNode.data || {}) as Record<string, unknown>, 'output', targetDescriptor.portId)
        : null;
      const remainingInsideLinks = (port?.insideLinks || []).filter((link) => !(
        link.nodeId === removedEdge.source && link.handleId === removedEdge.sourceHandle
      ));

      if (port && remainingInsideLinks.length === 0) {
        for (const edge of edges) {
          if (
            edge.source === removedEdge.target
            && edge.sourceHandle === buildGroupHandleId('output', port.id, 'external')
          ) {
            removedEdgeIds.add(edge.id);
          }
        }
      }
    }
  }

  return removedEdgeIds;
}

export function removeGroupPortLinksFromNodes(nodes: Node[], removedEdges: Edge[]) {
  if (removedEdges.length === 0) return nodes;

  return nodes.map((node) => {
    if (node.type !== 'group') return node;

    let nextData = (node.data || {}) as Record<string, unknown>;
    let didChange = false;

    for (const removedEdge of removedEdges) {
      const sourceDescriptor = parseGroupHandleId(removedEdge.sourceHandle);
      const targetDescriptor = parseGroupHandleId(removedEdge.targetHandle);

      if (
        sourceDescriptor
        && removedEdge.source === node.id
        && sourceDescriptor.side === 'input'
        && sourceDescriptor.role === 'internal'
      ) {
        nextData = {
          ...nextData,
          ...updateGroupPortList(nextData, 'input', (ports) => ports.map((port) => (
            port.id !== sourceDescriptor.portId
              ? port
              : {
                  ...port,
                  insideLinks: port.insideLinks.filter((link) => !(
                    link.nodeId === removedEdge.target && link.handleId === removedEdge.targetHandle
                  )),
                }
          ))),
        };
        didChange = true;
      }

      if (
        targetDescriptor
        && removedEdge.target === node.id
        && targetDescriptor.side === 'output'
        && targetDescriptor.role === 'internal'
      ) {
        nextData = {
          ...nextData,
          ...updateGroupPortList(nextData, 'output', (ports) => ports.map((port) => (
            port.id !== targetDescriptor.portId
              ? port
              : {
                  ...port,
                  insideLinks: port.insideLinks.filter((link) => !(
                    link.nodeId === removedEdge.source && link.handleId === removedEdge.sourceHandle
                  )),
                }
          ))),
        };
        didChange = true;
      }

      if (
        targetDescriptor
        && removedEdge.target === node.id
        && targetDescriptor.side === 'input'
        && targetDescriptor.role === 'external'
      ) {
        nextData = {
          ...nextData,
          ...updateGroupPortList(nextData, 'input', (ports) => ports.map((port) => (
            port.id !== targetDescriptor.portId
              ? port
              : {
                  ...port,
                  outsideLinks: port.outsideLinks.filter((link) => !(
                    link.nodeId === removedEdge.source && link.handleId === removedEdge.sourceHandle
                  )),
                }
          ))),
        };
        didChange = true;
      }

      if (
        sourceDescriptor
        && removedEdge.source === node.id
        && sourceDescriptor.side === 'output'
        && sourceDescriptor.role === 'external'
      ) {
        nextData = {
          ...nextData,
          ...updateGroupPortList(nextData, 'output', (ports) => ports.map((port) => (
            port.id !== sourceDescriptor.portId
              ? port
              : {
                  ...port,
                  outsideLinks: port.outsideLinks.filter((link) => !(
                    link.nodeId === removedEdge.target && link.handleId === removedEdge.targetHandle
                  )),
                }
          ))),
        };
        didChange = true;
      }
    }

    if (!didChange) return node;
    return {
      ...node,
      data: nextData,
    };
  });
}

export function removeGroupPortLinksReferencingNodes(nodes: Node[], removedNodeIds: Set<string>) {
  if (removedNodeIds.size === 0) return nodes;

  return nodes.map((node) => {
    if (node.type !== 'group') return node;

    let nextData = (node.data || {}) as Record<string, unknown>;
    let didChange = false;

    for (const side of ['input', 'output'] as const) {
      nextData = {
        ...nextData,
        ...updateGroupPortList(nextData, side, (ports) => ports.map((port) => {
          const insideLinks = port.insideLinks.filter((link) => !removedNodeIds.has(link.nodeId));
          const outsideLinks = insideLinks.length === 0
            ? []
            : port.outsideLinks.filter((link) => !removedNodeIds.has(link.nodeId));
          if (insideLinks.length === port.insideLinks.length && outsideLinks.length === port.outsideLinks.length) {
            return port;
          }
          didChange = true;
          return {
            ...port,
            insideLinks,
            outsideLinks,
          };
        })),
      };
    }

    return didChange ? { ...node, data: nextData } : node;
  });
}
