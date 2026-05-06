import type { Node } from '@xyflow/react';
import {
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import {
  buildGroupForNodes,
  duplicateNodesWithGroups,
  expandNodeActionIds,
  FORCE_DISABLED_NODE_TYPES,
  getAbsolutePosition,
  normalizeEditorNodes,
  ungroupGroupNodes,
} from '@/features/workflow/lib/store/editorShared';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

type WorkflowStoreGroupEditorActions = Pick<
  WorkflowState,
  | 'duplicateNodes'
  | 'createNodeGroup'
  | 'ungroupNodes'
  | 'releaseNodesFromGroup'
  | 'toggleNodesDisabled'
>;

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
      const nextNodes = normalizeEditorNodes(ungroupGroupNodes(get().nodes, groupIds), get().edges);
      if (nextNodes === get().nodes) return;

      set(() => ({
        nodes: nextNodes,
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
