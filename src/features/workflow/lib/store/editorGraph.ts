import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  constrainChildNodeSizeToGroupContent,
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import { getDefaultData, gid } from '@/features/workflow/lib/store/helpers';
import {
  autoArrangeNodes,
  expandNodeActionIds,
  isNodeLockedWithAncestors,
  normalizeMergeNodeSizes,
} from '@/features/workflow/lib/store/editorShared';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

type WorkflowStoreGraphEditorActions = Pick<
  WorkflowState,
  | 'setWorkflowName'
  | 'addNode'
  | 'duplicateNode'
  | 'autoArrangeWorkflow'
  | 'updateNodeData'
  | 'setNodeSize'
  | 'resetNodeSize'
  | 'removeNode'
  | 'removeNodes'
  | 'addEdge'
  | 'removeEdge'
  | 'selectNode'
  | 'toggleNodesLocked'
  | 'onNodesChange'
  | 'onEdgesChange'
  | 'markWorkflowDirty'
  | 'setShowDebugSizes'
  | 'setSnapToGridEnabled'
>;

export function createWorkflowGraphEditorActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreGraphEditorActions {
  return {
    setWorkflowName: (name) => set({ workflowName: name, hasUnsavedChanges: true }),

    addNode: (type, position, data) => {
      const nodeId = `node_${gid()}`;
      const newNode: Node = {
        id: nodeId,
        type,
        position,
        data: { ...getDefaultData(type), ...data },
      };

      set((state) => ({
        nodes: [...state.nodes, newNode],
        selectedNodeId: nodeId,
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));

      return nodeId;
    },

    duplicateNode: (nodeId) => {
      const sourceNode = get().nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return null;

      const duplicatedNodeId = `node_${gid()}`;
      const duplicatedNode: Node = {
        ...sourceNode,
        id: duplicatedNodeId,
        position: {
          x: sourceNode.position.x + 48,
          y: sourceNode.position.y + 48,
        },
        selected: false,
      };

      set((state) => ({
        nodes: [...state.nodes, duplicatedNode],
        selectedNodeId: duplicatedNodeId,
        hasUnsavedChanges: true,
      }));

      return duplicatedNodeId;
    },

    autoArrangeWorkflow: () => {
      set((state) => ({
        nodes: normalizeMergeNodeSizes(
          autoArrangeNodes(
            state.nodes,
            state.edges,
            state.nodes.filter((node) => node.selected).map((node) => node.id),
          ),
          state.edges,
        ),
        hasUnsavedChanges: true,
      }));
    },

    updateNodeData: (nodeId, data) => {
      set((state) => ({
        nodes: state.nodes.map((node) => (
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
        )),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    setNodeSize: (nodeId, size) => {
      if (isNodeLockedWithAncestors(nodeId, get().nodes)) return;
      set((state) => {
        const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
        return {
          nodes: enforceGroupLayout(state.nodes.map((node) => {
            if (node.id !== nodeId) return node;
            const resizedNode = {
              ...node,
              width: size.width,
              height: size.height,
            } as Node;
            const parentId = (node as Node & { parentId?: string }).parentId;
            if (parentId) {
              const parentNode = nodeMap.get(parentId);
              if (parentNode?.type === 'group') {
                return constrainChildNodeToGroupContent(
                  constrainChildNodeSizeToGroupContent(resizedNode, parentNode),
                  parentNode,
                );
              }
            }
            return pushRootNodeOutsideGroupAreas(resizedNode, state.nodes);
          })),
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    resetNodeSize: (nodeId) => {
      if (isNodeLockedWithAncestors(nodeId, get().nodes)) return;
      set((state) => ({
        nodes: state.nodes.map((node) => (
          node.id === nodeId
            ? { ...node, width: undefined, height: undefined }
            : node
        )),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    removeNode: (nodeId) => {
      get().removeNodes([nodeId]);
    },

    removeNodes: (nodeIds) => {
      const removedSet = new Set(expandNodeActionIds(get().nodes, nodeIds));
      if (removedSet.size === 0) return;

      set((state) => {
        const nodeExecStatus = { ...state.nodeExecStatus };
        const nodeExecutionTime = { ...state.nodeExecutionTime };
        const nodeExecutionStartedAt = { ...state.nodeExecutionStartedAt };
        const nodeErrors = { ...state.nodeErrors };
        const nodeWarnings = { ...state.nodeWarnings };
        const nodeOutputs = { ...state.nodeOutputs };

        for (const id of removedSet) {
          delete nodeExecStatus[id];
          delete nodeExecutionTime[id];
          delete nodeExecutionStartedAt[id];
          delete nodeErrors[id];
          delete nodeWarnings[id];
          delete nodeOutputs[id];
        }

        return {
          nodes: state.nodes.filter((node) => !removedSet.has(node.id)),
          edges: state.edges.filter((edge) => !removedSet.has(edge.source) && !removedSet.has(edge.target)),
          selectedNodeId: removedSet.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
          nodeExecStatus,
          nodeExecutionTime,
          nodeExecutionStartedAt,
          nodeErrors,
          nodeWarnings,
          nodeOutputs,
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    addEdge: (source, sourceHandle, target, targetHandle) => {
      const edges = get().edges;
      const exists = edges.some((edge) => (
        edge.source === source &&
        edge.sourceHandle === sourceHandle &&
        edge.target === target &&
        edge.targetHandle === targetHandle
      ));
      if (exists) return;

      const filteredEdges = edges.filter((edge) => !(
        edge.target === target && edge.targetHandle === targetHandle
      ));

      const newEdge: Edge = {
        id: `edge_${gid()}`,
        source,
        sourceHandle,
        target,
        targetHandle,
        type: 'default',
        animated: false,
        style: { strokeWidth: 2 },
      };

      const nextEdges = [...filteredEdges, newEdge];

      set((state) => ({
        edges: nextEdges,
        nodes: normalizeMergeNodeSizes(state.nodes, nextEdges),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    removeEdge: (edgeId) => {
      set((state) => {
        const edges = state.edges.filter((edge) => edge.id !== edgeId);
        return {
          edges,
          nodes: normalizeMergeNodeSizes(state.nodes, edges),
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    toggleNodesLocked: (nodeIds, locked) => {
      const targetIds = expandNodeActionIds(get().nodes, nodeIds);
      if (targetIds.length === 0) return;

      const targetSet = new Set(targetIds);
      const shouldLock = typeof locked === 'boolean'
        ? locked
        : get().nodes
          .filter((node) => targetSet.has(node.id))
          .some((node) => !Boolean(node.data?.locked));

      set((state) => ({
        nodes: state.nodes.map((node) => (
          targetSet.has(node.id)
            ? { ...node, data: { ...node.data, locked: shouldLock } }
            : node
        )),
        hasUnsavedChanges: true,
      }));
    },

    onNodesChange: (changes) => {
      set((state) => {
        const removedIds = expandNodeActionIds(
          state.nodes,
          changes
            .filter((change) => change.type === 'remove')
            .map((change) => change.id),
        );
        const filteredChanges = (removedIds.length > 0
          ? changes.filter((change) => !(change.type === 'remove' && removedIds.includes(change.id)))
          : changes)
          .filter((change) => {
            if (change.type === 'remove' || change.type === 'select') return true;
            if (!('id' in change)) return true;
            return !isNodeLockedWithAncestors(change.id, state.nodes);
          });
        const nodes = applyNodeChanges(filteredChanges, state.nodes).filter((node) => !removedIds.includes(node.id));

        if (removedIds.length === 0) {
          return {
            nodes: normalizeMergeNodeSizes(nodes, state.edges),
            hasUnsavedChanges: true,
          };
        }

        const removedSet = new Set(removedIds);
        const nodeExecStatus = { ...state.nodeExecStatus };
        const nodeExecutionTime = { ...state.nodeExecutionTime };
        const nodeExecutionStartedAt = { ...state.nodeExecutionStartedAt };
        const nodeErrors = { ...state.nodeErrors };
        const nodeWarnings = { ...state.nodeWarnings };
        const nodeOutputs = { ...state.nodeOutputs };

        for (const id of removedIds) {
          delete nodeExecStatus[id];
          delete nodeExecutionTime[id];
          delete nodeExecutionStartedAt[id];
          delete nodeErrors[id];
          delete nodeWarnings[id];
          delete nodeOutputs[id];
        }

        const edges = state.edges.filter((edge) => (
          !removedSet.has(edge.source) && !removedSet.has(edge.target)
        ));

        return {
          nodes: normalizeMergeNodeSizes(nodes, edges),
          edges,
          selectedNodeId: removedSet.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
          nodeExecStatus,
          nodeExecutionTime,
          nodeExecutionStartedAt,
          nodeErrors,
          nodeWarnings,
          nodeOutputs,
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    onEdgesChange: (changes) => {
      set((state) => {
        const edges = applyEdgeChanges(changes, state.edges);
        return {
          edges,
          nodes: normalizeMergeNodeSizes(state.nodes, edges),
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    markWorkflowDirty: () => set({ hasUnsavedChanges: true }),

    setShowDebugSizes: (show) => set({ showDebugSizes: show }),
    setSnapToGridEnabled: (enabled) => set({ snapToGridEnabled: enabled }),
  };
}
