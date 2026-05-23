import type { Edge, Node } from '@xyflow/react';
import {
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/domains/workflow/lib/groupLayout';
import {
  findGroupPort,
  parseGroupHandleId,
  pruneGroupPortEdges,
} from '@/domains/workflow/lib/groupPorts';
import {
  buildGroupForNodes,
  duplicateNodesWithGroups,
  expandNodeActionIds,
  FORCE_DISABLED_NODE_TYPES,
  getAbsolutePosition,
  normalizeEditorNodes,
  ungroupGroupNodes,
} from '@/domains/workflow/lib/store/editorShared';
import { gid } from '@/domains/workflow/lib/store/helpers';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';

type WorkflowStoreGroupEditorActions = Pick<
  WorkflowState,
  | 'duplicateNodes'
  | 'createNodeGroup'
  | 'ungroupNodes'
  | 'releaseNodesFromGroup'
  | 'toggleNodesDisabled'
>;

function rebuildEdgesForUngroupedGroups(nodes: Node[], edges: Edge[], groupIds: string[]) {
  const removedGroupIds = new Set(
    groupIds.filter((groupId) => nodes.some((node) => node.id === groupId && node.type === 'group')),
  );
  if (removedGroupIds.size === 0) return edges;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const seenEdgeKeys = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const nextEdges: Edge[] = [];

  for (const edge of edges) {
    const sourceDescriptor = parseGroupHandleId(edge.sourceHandle);
    const targetDescriptor = parseGroupHandleId(edge.targetHandle);

    if (
      removedGroupIds.has(edge.source)
      && sourceDescriptor?.side === 'input'
      && sourceDescriptor.role === 'internal'
    ) {
      continue;
    }

    if (
      removedGroupIds.has(edge.target)
      && targetDescriptor?.side === 'output'
      && targetDescriptor.role === 'internal'
    ) {
      continue;
    }

    let expandedEdges: Edge[] = [{ ...edge }];

    if (removedGroupIds.has(edge.source)) {
      const groupNode = nodeMap.get(edge.source);
      const descriptor = sourceDescriptor;
      const sourcePort = groupNode && descriptor
        ? findGroupPort((groupNode.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId)
        : null;

      if (
        groupNode?.type !== 'group'
        || !descriptor
        || descriptor.side !== 'output'
        || descriptor.role !== 'external'
        || !sourcePort
      ) {
        expandedEdges = [];
      } else {
        expandedEdges = sourcePort.insideLinks.map((insideLink) => ({
          ...edge,
          source: insideLink.nodeId,
          sourceHandle: insideLink.handleId,
        }));
      }
    }

    if (expandedEdges.length === 0) continue;

    if (removedGroupIds.has(edge.target)) {
      const groupNode = nodeMap.get(edge.target);
      const descriptor = targetDescriptor;
      const targetPort = groupNode && descriptor
        ? findGroupPort((groupNode.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId)
        : null;

      if (
        groupNode?.type !== 'group'
        || !descriptor
        || descriptor.side !== 'input'
        || descriptor.role !== 'external'
        || !targetPort
      ) {
        expandedEdges = [];
      } else {
        const nextExpandedEdges: Edge[] = [];
        for (const currentEdge of expandedEdges) {
          for (const insideLink of targetPort.insideLinks) {
            nextExpandedEdges.push({
              ...currentEdge,
              target: insideLink.nodeId,
              targetHandle: insideLink.handleId,
            });
          }
        }
        expandedEdges = nextExpandedEdges;
      }
    }

    for (const nextEdge of expandedEdges) {
      if (removedGroupIds.has(nextEdge.source) || removedGroupIds.has(nextEdge.target)) continue;

      const edgeKey = [
        nextEdge.source,
        nextEdge.sourceHandle || '',
        nextEdge.target,
        nextEdge.targetHandle || '',
      ].join('|');
      if (seenEdgeKeys.has(edgeKey)) continue;

      seenEdgeKeys.add(edgeKey);
      let nextEdgeId = nextEdge.id;
      if (!nextEdgeId || seenEdgeIds.has(nextEdgeId)) {
        do {
          nextEdgeId = `edge_${gid()}`;
        } while (seenEdgeIds.has(nextEdgeId));
      }
      seenEdgeIds.add(nextEdgeId);
      nextEdges.push(nextEdgeId === nextEdge.id ? nextEdge : { ...nextEdge, id: nextEdgeId });
    }
  }

  return nextEdges;
}

export function createWorkflowGroupEditorActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreGroupEditorActions {
  return {
    duplicateNodes: (nodeIds) => {
      const { nodes: duplicatedNodes, edges: duplicatedEdges } = duplicateNodesWithGroups(
        get().nodes,
        get().edges,
        nodeIds,
      );

      if (duplicatedNodes.length === 0) return [];

      const duplicatedIds = duplicatedNodes.map((node) => node.id);
      set((state) => ({
        nodes: normalizeEditorNodes(
          [
            ...state.nodes.map((node) => ({ ...node, selected: false })),
            ...duplicatedNodes,
          ],
          [...state.edges, ...duplicatedEdges],
        ),
        edges: [...state.edges, ...duplicatedEdges],
        selectedNodeId: duplicatedIds[0] || null,
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));

      return duplicatedIds;
    },

    createNodeGroup: (nodeIds) => {
      const result = buildGroupForNodes(get().nodes, get().edges, nodeIds);
      if (!result) return null;

      set(() => ({
        nodes: normalizeEditorNodes(enforceGroupLayout(result.nodes), result.edges),
        edges: result.edges,
        selectedNodeId: result.groupNode.id,
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));

      return result.groupNode.id;
    },

    ungroupNodes: (groupIds) => {
      const currentNodes = get().nodes;
      const currentEdges = get().edges;
      const ungroupedNodes = ungroupGroupNodes(currentNodes, groupIds);
      const rebuiltEdges = rebuildEdgesForUngroupedGroups(currentNodes, currentEdges, groupIds);
      const nextEdges = pruneGroupPortEdges(ungroupedNodes, rebuiltEdges);
      const nextNodes = normalizeEditorNodes(ungroupedNodes, nextEdges);
      if (nextNodes === currentNodes && nextEdges === currentEdges) return;

      set(() => ({
        nodes: nextNodes,
        edges: nextEdges,
        selectedNodeId: null,
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    releaseNodesFromGroup: (nodeIds) => {
      const targetSet = new Set(nodeIds);
      const currentNodes = get().nodes;
      const nodeMap = new Map(currentNodes.map((node) => [node.id, node]));
      const positionMemo = new Map<string, { x: number; y: number }>();
      const releasedNodes = currentNodes.map((node) => {
        if (!targetSet.has(node.id)) return node;
        const parentId = (node as Node & { parentId?: string }).parentId;
        if (!parentId) return node;
        const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
        return pushRootNodeOutsideGroupAreas({
          ...node,
          parentId: undefined,
          extent: undefined,
          position: absolutePosition,
          selected: true,
        } as Node, currentNodes);
      });

      set(() => ({
        nodes: normalizeEditorNodes(enforceGroupLayout(releasedNodes), get().edges),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    toggleNodesDisabled: (nodeIds, disabled) => {
      const targetIds = expandNodeActionIds(get().nodes, nodeIds);
      if (targetIds.length === 0) return;
      const targetSet = new Set(targetIds);

      set((state) => ({
        nodes: state.nodes.map((node) => {
          if (!targetSet.has(node.id)) return node;
          if (FORCE_DISABLED_NODE_TYPES.has(node.type || '')) {
            return {
              ...node,
              data: {
                ...node.data,
                disabled: true,
              },
            };
          }
          const nextDisabled = typeof disabled === 'boolean'
            ? disabled
            : !Boolean((node.data as Record<string, unknown>)?.disabled);
          return {
            ...node,
            data: {
              ...node.data,
              disabled: nextDisabled,
            },
          };
        }),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },
  };
}
