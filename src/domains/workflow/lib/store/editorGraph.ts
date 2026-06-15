import {
  constrainChildNodeSizeToGroupContent,
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  getCollapsedGroupNodeSize,
  getEffectiveNodeSize,
  pushRootNodeOutsideGroupAreas,
} from '@/domains/workflow/lib/groupLayout';
import {
  type GroupPort,
  buildGroupHandleId,
  findGroupPort,
  pruneGroupPortEdges,
  updateGroupPortList,
} from '@/domains/workflow/lib/groupPorts';
import {
  buildBypassEdgesForNode,
  buildInsertionEdgesForNode,
} from '@/domains/workflow/lib/store/editorGraphEdgeBuilders';
import {
  collectCascadeRemovedGroupEdgeIds,
  removeGroupPortLinksFromNodes,
  removeGroupPortLinksReferencingNodes,
} from '@/domains/workflow/lib/store/editorGraphGroupEdges';
import { buildRemovedNodesGraphState } from '@/domains/workflow/lib/store/editorGraphNodeRemoval';
import {
  autoArrangeNodes,
  compactDynamicInputEdges,
  expandNodeActionIds,
  isNodeLockedWithAncestors,
  normalizeEditorNodes,
} from '@/domains/workflow/lib/store/editorShared';
import { getDefaultData, gid } from '@/domains/workflow/lib/store/helpers';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';
import { type Edge, type Node, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';

type WorkflowStoreGraphEditorActions = Pick<
  WorkflowState,
  | 'setWorkflowName'
  | 'addNode'
  | 'duplicateNode'
  | 'autoArrangeWorkflow'
  | 'updateNodeData'
  | 'toggleGroupCollapsed'
  | 'updateGroupPort'
  | 'setNodeSize'
  | 'resetNodeSize'
  | 'removeNode'
  | 'removeNodes'
  | 'removeNodeWithoutReconnect'
  | 'removeNodesWithoutReconnect'
  | 'detachNodeFromChain'
  | 'insertNodeOnEdge'
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
        nodes: normalizeEditorNodes([...state.nodes, newNode], state.edges),
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
        nodes: normalizeEditorNodes([...state.nodes, duplicatedNode], state.edges),
        selectedNodeId: duplicatedNodeId,
        hasUnsavedChanges: true,
      }));

      return duplicatedNodeId;
    },

    autoArrangeWorkflow: () => {
      set((state) => ({
        nodes: normalizeEditorNodes(
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
        nodes: normalizeEditorNodes(
          state.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node)),
          state.edges,
        ),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    toggleGroupCollapsed: (groupId, collapsed) => {
      set((state) => ({
        nodes: normalizeEditorNodes(
          enforceGroupLayout(
            state.nodes.map((node) => {
              if (node.id !== groupId || node.type !== 'group') return node;

              const nextCollapsed = typeof collapsed === 'boolean' ? collapsed : !node.data?.collapsed;

              if (nextCollapsed) {
                const currentSize = getEffectiveNodeSize(node);
                const collapsedSize = getCollapsedGroupNodeSize(node);
                return {
                  ...node,
                  width: collapsedSize.width,
                  height: collapsedSize.height,
                  data: {
                    ...node.data,
                    collapsed: true,
                    expandedWidth: currentSize.width,
                    expandedHeight: currentSize.height,
                  },
                };
              }

              const restoredWidth =
                typeof node.data?.expandedWidth === 'number'
                  ? node.data.expandedWidth
                  : getEffectiveNodeSize(node).width;
              const restoredHeight =
                typeof node.data?.expandedHeight === 'number'
                  ? node.data.expandedHeight
                  : getEffectiveNodeSize(node).height;

              return {
                ...node,
                width: restoredWidth,
                height: restoredHeight,
                data: {
                  ...node.data,
                  collapsed: false,
                },
              };
            }),
          ),
          state.edges,
        ),
        hasUnsavedChanges: true,
      }));
    },

    updateGroupPort: (groupId, side, portId, patch) => {
      set((state) => {
        let didChange = false;
        const updatedNodes = state.nodes.map((node) => {
          if (node.id !== groupId || node.type !== 'group') return node;

          const currentData = (node.data || {}) as Record<string, unknown>;
          const nextData = {
            ...node.data,
            ...updateGroupPortList(currentData, side, (ports) =>
              ports.map((port) => {
                if (port.id !== portId) return port;
                didChange = true;
                return {
                  ...port,
                  ...patch,
                } satisfies GroupPort;
              }),
            ),
          };

          return {
            ...node,
            data: nextData,
          };
        });

        if (!didChange) return {};

        const updatedGroupNode = updatedNodes.find((node) => node.id === groupId && node.type === 'group');
        const resolvedNextPort = updatedGroupNode
          ? findGroupPort((updatedGroupNode.data || {}) as Record<string, unknown>, side, portId)
          : null;
        const shouldClearPortEdges =
          (resolvedNextPort?.insideLinks.length ?? 0) === 0 && (resolvedNextPort?.outsideLinks.length ?? 0) === 0;
        const externalHandleId = buildGroupHandleId(side, portId, 'external');
        const internalHandleId = buildGroupHandleId(side, portId, 'internal');
        const nextEdges = shouldClearPortEdges
          ? pruneGroupPortEdges(
              updatedNodes,
              state.edges.filter((edge) => {
                if (side === 'input') {
                  return !(
                    (edge.target === groupId && edge.targetHandle === externalHandleId) ||
                    (edge.source === groupId && edge.sourceHandle === internalHandleId)
                  );
                }
                return !(
                  (edge.source === groupId && edge.sourceHandle === externalHandleId) ||
                  (edge.target === groupId && edge.targetHandle === internalHandleId)
                );
              }),
            )
          : pruneGroupPortEdges(updatedNodes, state.edges);

        return {
          nodes: normalizeEditorNodes(updatedNodes, nextEdges),
          edges: nextEdges,
          hasUnsavedChanges: true,
        };
      });
    },

    setNodeSize: (nodeId, size) => {
      if (isNodeLockedWithAncestors(nodeId, get().nodes)) return;
      set((state) => {
        const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
        return {
          nodes: normalizeEditorNodes(
            enforceGroupLayout(
              state.nodes.map((node) => {
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
              }),
            ),
            state.edges,
          ),
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    resetNodeSize: (nodeId) => {
      if (isNodeLockedWithAncestors(nodeId, get().nodes)) return;
      set((state) => ({
        nodes: normalizeEditorNodes(
          state.nodes.map((node) => (node.id === nodeId ? { ...node, width: undefined, height: undefined } : node)),
          state.edges,
        ),
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
        const remainingNodes = state.nodes.filter((node) => !removedSet.has(node.id));
        return buildRemovedNodesGraphState(state, removedSet, remainingNodes, true);
      });
    },

    removeNodeWithoutReconnect: (nodeId) => {
      get().removeNodesWithoutReconnect([nodeId]);
    },

    removeNodesWithoutReconnect: (nodeIds) => {
      const removedSet = new Set(expandNodeActionIds(get().nodes, nodeIds));
      if (removedSet.size === 0) return;

      set((state) => {
        const remainingNodes = state.nodes.filter((node) => !removedSet.has(node.id));
        return buildRemovedNodesGraphState(state, removedSet, remainingNodes, false);
      });
    },

    detachNodeFromChain: (nodeId) => {
      const node = get().nodes.find((item) => item.id === nodeId);
      if (!node || node.type === 'group') return;

      set((state) => {
        const incidentEdges = state.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
        if (incidentEdges.length === 0) return {};

        const remainingEdges = state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
        const bypassEdges = buildBypassEdgesForNode(state.nodes, state.edges, nodeId, remainingEdges);
        if (bypassEdges.length === 0) return {};

        const updatedNodes = removeGroupPortLinksReferencingNodes(
          removeGroupPortLinksFromNodes(state.nodes, incidentEdges),
          new Set([nodeId]),
        );
        const nextEdges = pruneGroupPortEdges(updatedNodes, [...remainingEdges, ...bypassEdges]);

        return {
          nodes: normalizeEditorNodes(updatedNodes, nextEdges),
          edges: nextEdges,
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    insertNodeOnEdge: (nodeId, edgeId) => {
      const node = get().nodes.find((item) => item.id === nodeId);
      if (!node || node.type === 'group') return;

      set((state) => {
        const replacedEdge = state.edges.find((edge) => edge.id === edgeId);
        if (!replacedEdge) return {};

        const nextEdges = buildInsertionEdgesForNode(state.nodes, state.edges, nodeId, edgeId);
        if (!nextEdges) return {};

        const updatedNodes = removeGroupPortLinksFromNodes(state.nodes, [replacedEdge]);
        const prunedEdges = pruneGroupPortEdges(updatedNodes, nextEdges);

        return {
          nodes: normalizeEditorNodes(updatedNodes, prunedEdges),
          edges: prunedEdges,
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    addEdge: (source, sourceHandle, target, targetHandle) => {
      const edges = get().edges;
      const exists = edges.some(
        (edge) =>
          edge.source === source &&
          edge.sourceHandle === sourceHandle &&
          edge.target === target &&
          edge.targetHandle === targetHandle,
      );
      if (exists) return;

      // Skip single-connection filter for node types that support multi-input
      const targetNode = get().nodes.find((n) => n.id === target);
      const isMultiInput = targetNode?.type === 'aiV3' || targetNode?.type === 'io';

      // Enforce per-type connection limits for V2 nodes
      if (isMultiInput && targetHandle === 'input') {
        const sourceNode = get().nodes.find((n) => n.id === source);
        const sourceNodeType = sourceNode?.type || '';
        const isMaskSource = sourceNodeType === 'maskInput' || sourceNodeType.toLowerCase().includes('mask');
        const isVideoSource = sourceNodeType && (sourceNodeType.toLowerCase().includes('video') && !sourceNodeType.toLowerCase().includes('videogen'));
        const isAudioSource = sourceNodeType && sourceNodeType.toLowerCase().includes('audio');
        const isImageSource =
          !isMaskSource && !isVideoSource && !isAudioSource &&
          (sourceNodeType.includes('image') || sourceNodeType.includes('Image'));

        const existingEdgesToTarget = edges.filter((e) => e.target === target && e.targetHandle === 'input');

        const countByType = (typeCheck: (t: string) => boolean) =>
          existingEdgesToTarget.filter((e) => {
            const src = get().nodes.find((n) => n.id === e.source);
            return src?.type ? typeCheck(src.type) : false;
          }).length;

        if (isMaskSource && countByType((t) => t === 'maskInput') >= 1) return;
        if (isVideoSource && countByType((t) => t.includes('video') && !t.includes('videogen')) >= 1) return;
        if (isAudioSource && countByType((t) => t.includes('audio')) >= 1) return;
        if (isImageSource) {
          if (targetNode?.type === 'aiV3') {
            if (countByType((t) => t.includes('image') || t.includes('Image') || t.includes('video') || t.includes('Video')) >= 9) return;
          }
        }
      }
      const filteredEdges = isMultiInput
        ? edges
        : edges.filter((edge) => !(edge.target === target && edge.targetHandle === targetHandle));

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
        nodes: normalizeEditorNodes(state.nodes, nextEdges),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    removeEdge: (edgeId) => {
      set((state) => {
        const removedEdges = state.edges.filter((edge) => edge.id === edgeId);
        const cascadeRemovedEdgeIds = collectCascadeRemovedGroupEdgeIds(state.nodes, state.edges, removedEdges);
        const allRemovedEdges = state.edges.filter((edge) => edge.id === edgeId || cascadeRemovedEdgeIds.has(edge.id));
        const updatedNodes = removeGroupPortLinksFromNodes(state.nodes, allRemovedEdges);
        const edges = pruneGroupPortEdges(
          updatedNodes,
          compactDynamicInputEdges(
            updatedNodes,
            state.edges.filter((edge) => edge.id !== edgeId && !cascadeRemovedEdgeIds.has(edge.id)),
          ),
        );
        return {
          edges,
          nodes: normalizeEditorNodes(updatedNodes, edges),
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
      const shouldLock =
        typeof locked === 'boolean'
          ? locked
          : get()
              .nodes.filter((node) => targetSet.has(node.id))
              .some((node) => !node.data?.locked);

      set((state) => ({
        nodes: state.nodes.map((node) =>
          targetSet.has(node.id) ? { ...node, data: { ...node.data, locked: shouldLock } } : node,
        ),
        hasUnsavedChanges: true,
      }));
    },

    onNodesChange: (changes) => {
      set((state) => {
        const removedIds = expandNodeActionIds(
          state.nodes,
          changes.filter((change) => change.type === 'remove').map((change) => change.id),
        );
        const filteredChanges = (
          removedIds.length > 0
            ? changes.filter((change) => !(change.type === 'remove' && removedIds.includes(change.id)))
            : changes
        ).filter((change) => {
          if (change.type === 'remove' || change.type === 'select' || change.type === 'dimensions') return true;
          if (!('id' in change)) return true;
          return !isNodeLockedWithAncestors(change.id, state.nodes);
        });
        const nodes = applyNodeChanges(filteredChanges, state.nodes).filter((node) => !removedIds.includes(node.id));

        if (removedIds.length === 0) {
          return {
            nodes: normalizeEditorNodes(nodes, state.edges),
            hasUnsavedChanges: true,
          };
        }

        const removedSet = new Set(removedIds);
        return buildRemovedNodesGraphState(state, removedSet, nodes, true);
      });
    },

    onEdgesChange: (changes) => {
      set((state) => {
        const removedIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
        const removedEdges = state.edges.filter((edge) => removedIds.has(edge.id));
        const cascadeRemovedEdgeIds = collectCascadeRemovedGroupEdgeIds(state.nodes, state.edges, removedEdges);
        const allRemovedEdges = state.edges.filter(
          (edge) => removedIds.has(edge.id) || cascadeRemovedEdgeIds.has(edge.id),
        );
        const updatedNodes = removeGroupPortLinksFromNodes(state.nodes, allRemovedEdges);
        const edges = pruneGroupPortEdges(
          updatedNodes,
          compactDynamicInputEdges(
            updatedNodes,
            applyEdgeChanges(changes, state.edges).filter((edge) => !cascadeRemovedEdgeIds.has(edge.id)),
          ),
        );
        return {
          edges,
          nodes: normalizeEditorNodes(updatedNodes, edges),
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
