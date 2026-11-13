import { getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { getCollapsedGroupNodeSize } from '@/domains/workflow/lib/groupLayout';
import { collectDescendantNodeIds } from '@/domains/workflow/lib/groupPorts';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import type { Edge, Node as FlowNodeType } from '@xyflow/react';

export const COLLAPSED_GROUP_INPUT_ANCHOR = 'collapsed-group-input';
export const COLLAPSED_GROUP_OUTPUT_ANCHOR = 'collapsed-group-output';

type BuildFlowCanvasRenderModelInput = {
  nodes: FlowNodeType[];
  edges: Edge[];
};

export function buildFlowCanvasRenderModel({ nodes, edges }: BuildFlowCanvasRenderModelInput) {
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
      const collapsedSize = node.type === 'group' && node.data?.collapsed ? getCollapsedGroupNodeSize(node) : null;
      const width = collapsedSize
        ? collapsedSize.width
        : typeof node.width === 'number'
          ? Math.max(node.width, size.w)
          : size.w;
      const height = collapsedSize
        ? collapsedSize.height
        : typeof node.height === 'number'
          ? Math.max(node.height, size.h)
          : size.h;
      const minWidth = collapsedSize ? collapsedSize.width : size.w;
      const minHeight = collapsedSize ? collapsedSize.height : size.h;

      return {
        ...node,
        draggable: !isNodeLockedWithAncestors(node.id, nodes),
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

  const visibleEndpoints = new Map<string, string>();
  for (const nodeId of collapsedDescendantIds) {
    let parentId = nodeMap.get(nodeId)?.parentId;
    while (parentId && collapsedDescendantIds.has(parentId)) {
      parentId = nodeMap.get(parentId)?.parentId;
    }
    if (parentId) visibleEndpoints.set(nodeId, parentId);
  }

  const inputAnchors = new Set<string>();
  const outputAnchors = new Set<string>();
  const visibleEdges = edges.flatMap((edge) => {
    const source = visibleEndpoints.get(edge.source) ?? edge.source;
    const target = visibleEndpoints.get(edge.target) ?? edge.target;
    const projected = source !== edge.source || target !== edge.target;
    if (!projected) return [{ ...edge, type: 'default' }];
    if (source === target) return [];
    if (source !== edge.source) outputAnchors.add(source);
    if (target !== edge.target) inputAnchors.add(target);
    return [{
      ...edge,
      source,
      target,
      sourceHandle: source === edge.source ? edge.sourceHandle : COLLAPSED_GROUP_OUTPUT_ANCHOR,
      targetHandle: target === edge.target ? edge.targetHandle : COLLAPSED_GROUP_INPUT_ANCHOR,
      type: 'default',
      selectable: false,
      deletable: false,
      reconnectable: false,
      selected: false,
      data: { ...edge.data, collapsedGroupPreview: true },
    }];
  });

  const nodesWithAnchors = visibleNodes.map((node) => collapsedGroupIds.has(node.id) ? {
    ...node,
    data: {
      ...node.data,
      showCollapsedInputAnchor: inputAnchors.has(node.id),
      showCollapsedOutputAnchor: outputAnchors.has(node.id),
    },
  } : node);

  return { nodes: nodesWithAnchors, edges: visibleEdges, collapsedGroupIds, nodeMap };
}
