import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import { getNodeDefaultSize } from '@/features/workflow/lib/constants';
import {
  buildGroupHandleId,
  collectDescendantNodeIds,
  findGroupPort,
  getGroupPorts,
  parseGroupHandleId,
} from '@/features/workflow/lib/groupPorts';
import { getCollapsedGroupNodeSize } from '@/features/workflow/lib/groupLayout';
import { getVisibleCollapsedAncestorId } from './flowCanvasConnections';
import {
  DEFAULT_WORKFLOW_EDGE_STYLE,
  getDecoratedGroupEdge,
  getNearestGroupAncestorId,
} from './flowCanvasUiHelpers';

const GROUP_INTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;

const GROUP_EXTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;

type BuildFlowCanvasRenderModelInput = {
  nodes: FlowNodeType[];
  edges: Edge[];
};

export function buildFlowCanvasRenderModel({
  nodes,
  edges,
}: BuildFlowCanvasRenderModelInput) {
  const collapsedGroups = nodes.filter((node) => node.type === 'group' && node.data?.collapsed);
  const collapsedGroupIds = new Set(collapsedGroups.map((node) => node.id));
  const collapsedDescendantIds = new Set<string>();

  for (const group of collapsedGroups) {
    for (const nodeId of collectDescendantNodeIds(nodes, group.id)) {
      collapsedDescendantIds.add(nodeId);
    }
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const visibleNodes = nodes
    .filter((node) => !collapsedDescendantIds.has(node.id))
    .map((node) => {
      const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
      const size = getNodeDefaultSize(node.type || '', inputCount);
      const collapsedSize = node.type === 'group' && node.data?.collapsed
        ? getCollapsedGroupNodeSize(node)
        : null;
      const width = collapsedSize
        ? collapsedSize.width
        : typeof node.width === 'number' ? Math.max(node.width, size.w) : size.w;
      const height = collapsedSize
        ? collapsedSize.height
        : typeof node.height === 'number' ? Math.max(node.height, size.h) : size.h;
      const minWidth = collapsedSize ? collapsedSize.width : size.w;
      const minHeight = collapsedSize ? collapsedSize.height : size.h;

      return {
        ...node,
        zIndex: node.type === 'group' ? 0 : 1,
        style: {
          ...(node.style || {}),
          width,
          height,
          minWidth,
          minHeight,
        },
      } as FlowNodeType;
    })
    .sort((a, b) => {
      const aParent = Boolean((a as FlowNodeType & { parentId?: string }).parentId);
      const bParent = Boolean((b as FlowNodeType & { parentId?: string }).parentId);
      if (aParent !== bParent) return aParent ? 1 : -1;
      if ((a.type === 'group') !== (b.type === 'group')) return a.type === 'group' ? -1 : 1;
      return 0;
    });

  const visibleEdges: Edge[] = [];
  const virtualEdges: Edge[] = [];
  const internalPortEdges: Edge[] = [];
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  for (const node of visibleNodes) {
    if (node.type !== 'group' || collapsedGroupIds.has(node.id)) continue;

    const nodeData = (node.data || {}) as Record<string, unknown>;
    for (const port of getGroupPorts(nodeData, 'input')) {
      for (const insideLink of port.insideLinks) {
        if (!visibleNodeIds.has(insideLink.nodeId)) continue;
        internalPortEdges.push({
          id: `group-binding:${node.id}:input:${port.id}:${insideLink.nodeId}:${insideLink.handleId}`,
          source: node.id,
          sourceHandle: buildGroupHandleId('input', port.id, 'internal'),
          target: insideLink.nodeId,
          targetHandle: insideLink.handleId,
          type: 'default',
          animated: false,
          style: { ...GROUP_INTERNAL_EDGE_STYLE },
        });
      }
    }

    for (const port of getGroupPorts(nodeData, 'output')) {
      for (const insideLink of port.insideLinks) {
        if (!visibleNodeIds.has(insideLink.nodeId)) continue;
        internalPortEdges.push({
          id: `group-binding:${node.id}:output:${port.id}:${insideLink.nodeId}:${insideLink.handleId}`,
          source: insideLink.nodeId,
          sourceHandle: insideLink.handleId,
          target: node.id,
          targetHandle: buildGroupHandleId('output', port.id, 'internal'),
          type: 'default',
          animated: false,
          style: { ...GROUP_INTERNAL_EDGE_STYLE },
        });
      }
    }
  }

  for (const edge of edges) {
    const sourceDescriptor = parseGroupHandleId(edge.sourceHandle);
    const targetDescriptor = parseGroupHandleId(edge.targetHandle);
    const sourceNodeForEdge = nodeMap.get(edge.source);
    const targetNodeForEdge = nodeMap.get(edge.target);
    const sourceIsCollapsedGroupExternal =
      sourceNodeForEdge?.type === 'group'
      && collapsedGroupIds.has(edge.source)
      && sourceDescriptor?.role === 'external';
    const targetIsCollapsedGroupExternal =
      targetNodeForEdge?.type === 'group'
      && collapsedGroupIds.has(edge.target)
      && targetDescriptor?.role === 'external';

    if (
      sourceDescriptor
      && sourceNodeForEdge?.type === 'group'
      && sourceDescriptor.side === 'input'
      && sourceDescriptor.role === 'internal'
    ) {
      const port = findGroupPort(
        (sourceNodeForEdge.data || {}) as Record<string, unknown>,
        'input',
        sourceDescriptor.portId,
      );
      if (port?.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle)) {
        continue;
      }
    }

    if (
      targetDescriptor
      && targetNodeForEdge?.type === 'group'
      && targetDescriptor.side === 'output'
      && targetDescriptor.role === 'internal'
    ) {
      const port = findGroupPort(
        (targetNodeForEdge.data || {}) as Record<string, unknown>,
        'output',
        targetDescriptor.portId,
      );
      if (port?.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle)) {
        continue;
      }
    }

    if (sourceIsCollapsedGroupExternal || targetIsCollapsedGroupExternal) {
      visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
      continue;
    }

    const sourceGroupId = getNearestGroupAncestorId(edge.source, nodeMap);
    const targetGroupId = getNearestGroupAncestorId(edge.target, nodeMap);
    const sourceCollapsedGroupId = getVisibleCollapsedAncestorId(edge.source, nodeMap, collapsedGroupIds);
    const targetCollapsedGroupId = getVisibleCollapsedAncestorId(edge.target, nodeMap, collapsedGroupIds);
    const visibleSourceGroupId = sourceCollapsedGroupId || sourceGroupId;
    const visibleTargetGroupId = targetCollapsedGroupId || targetGroupId;

    if (!visibleSourceGroupId && !visibleTargetGroupId) {
      visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
      continue;
    }

    if (visibleSourceGroupId && visibleTargetGroupId && visibleSourceGroupId === visibleTargetGroupId) {
      if (!sourceCollapsedGroupId && !targetCollapsedGroupId) {
        visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
      }
      continue;
    }

    if (!visibleSourceGroupId && visibleTargetGroupId) {
      const groupNode = nodeMap.get(visibleTargetGroupId);
      const ports = groupNode ? getGroupPorts((groupNode.data || {}) as Record<string, unknown>, 'input') : [];
      const port = ports.find((item) => item.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle));
      if (!port) continue;
      virtualEdges.push({
        id: `virtual:${edge.id}`,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: visibleTargetGroupId,
        targetHandle: buildGroupHandleId('input', port.id, 'external'),
        type: 'default',
        animated: false,
        style: { ...GROUP_EXTERNAL_EDGE_STYLE },
      });
      continue;
    }

    if (visibleSourceGroupId && !visibleTargetGroupId) {
      const groupNode = nodeMap.get(visibleSourceGroupId);
      const ports = groupNode ? getGroupPorts((groupNode.data || {}) as Record<string, unknown>, 'output') : [];
      const port = ports.find((item) => item.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle));
      if (!port) continue;
      virtualEdges.push({
        id: `virtual:${edge.id}`,
        source: visibleSourceGroupId,
        sourceHandle: buildGroupHandleId('output', port.id, 'external'),
        target: edge.target,
        targetHandle: edge.targetHandle,
        type: 'default',
        animated: false,
        style: { ...GROUP_EXTERNAL_EDGE_STYLE },
      });
      continue;
    }

    if (visibleSourceGroupId && visibleTargetGroupId) {
      const sourceGroupNode = nodeMap.get(visibleSourceGroupId);
      const targetGroupNode = nodeMap.get(visibleTargetGroupId);
      const sourcePorts = sourceGroupNode ? getGroupPorts((sourceGroupNode.data || {}) as Record<string, unknown>, 'output') : [];
      const targetPorts = targetGroupNode ? getGroupPorts((targetGroupNode.data || {}) as Record<string, unknown>, 'input') : [];
      const sourcePort = sourcePorts.find((item) => item.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle));
      const targetPort = targetPorts.find((item) => item.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle));
      if (!sourcePort || !targetPort) continue;
      virtualEdges.push({
        id: `virtual:${edge.id}`,
        source: visibleSourceGroupId,
        sourceHandle: buildGroupHandleId('output', sourcePort.id, 'external'),
        target: visibleTargetGroupId,
        targetHandle: buildGroupHandleId('input', targetPort.id, 'external'),
        type: 'default',
        animated: false,
        style: { ...GROUP_EXTERNAL_EDGE_STYLE },
      });
    }
  }

  return {
    nodes: visibleNodes,
    edges: [...visibleEdges, ...virtualEdges, ...internalPortEdges],
    collapsedGroupIds,
    nodeMap,
  };
}
