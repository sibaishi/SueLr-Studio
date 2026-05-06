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
  getCollapsedGroupNodeSize,
  getEffectiveNodeSize,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import {
  buildGroupHandleId,
  findGroupPort,
  parseGroupHandleId,
  pruneGroupPortEdges,
  updateGroupPortList,
  type GroupPort,
} from '@/features/workflow/lib/groupPorts';
import { getDefaultData, gid } from '@/features/workflow/lib/store/helpers';
import {
  autoArrangeNodes,
  expandNodeActionIds,
  isNodeLockedWithAncestors,
  normalizeEditorNodes,
} from '@/features/workflow/lib/store/editorShared';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

function collectCascadeRemovedGroupEdgeIds(nodes: Node[], edges: Edge[], removedEdges: Edge[]) {
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

function removeGroupPortLinksFromNodes(nodes: Node[], removedEdges: Edge[]) {
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
        nodes: normalizeEditorNodes(state.nodes.map((node) => (
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
        )), state.edges),
        nodeWarnings: {},
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
      }));
    },

    toggleGroupCollapsed: (groupId, collapsed) => {
      set((state) => ({
        nodes: normalizeEditorNodes(enforceGroupLayout(state.nodes.map((node) => {
          if (node.id !== groupId || node.type !== 'group') return node;

          const nextCollapsed = typeof collapsed === 'boolean'
            ? collapsed
            : !Boolean(node.data?.collapsed);

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

          const restoredWidth = typeof node.data?.expandedWidth === 'number'
            ? node.data.expandedWidth
            : getEffectiveNodeSize(node).width;
          const restoredHeight = typeof node.data?.expandedHeight === 'number'
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
        })), state.edges),
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
            ...updateGroupPortList(
              currentData,
              side,
              (ports) => ports.map((port) => {
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
        const shouldClearPortEdges = (
          (resolvedNextPort?.insideLinks.length ?? 0) === 0
          && (resolvedNextPort?.outsideLinks.length ?? 0) === 0
        );
        const externalHandleId = buildGroupHandleId(side, portId, 'external');
        const internalHandleId = buildGroupHandleId(side, portId, 'internal');
        const nextEdges = shouldClearPortEdges
          ? pruneGroupPortEdges(
              updatedNodes,
              state.edges.filter((edge) => {
                if (side === 'input') {
                  return !(
                    (edge.target === groupId && edge.targetHandle === externalHandleId)
                    || (edge.source === groupId && edge.sourceHandle === internalHandleId)
                  );
                }
                return !(
                  (edge.source === groupId && edge.sourceHandle === externalHandleId)
                  || (edge.target === groupId && edge.targetHandle === internalHandleId)
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
          nodes: normalizeEditorNodes(enforceGroupLayout(state.nodes.map((node) => {
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
          })), state.edges),
          nodeWarnings: {},
          workflowWarningMessage: null,
          hasUnsavedChanges: true,
        };
      });
    },

    resetNodeSize: (nodeId) => {
      if (isNodeLockedWithAncestors(nodeId, get().nodes)) return;
      set((state) => ({
        nodes: normalizeEditorNodes(state.nodes.map((node) => (
          node.id === nodeId
            ? { ...node, width: undefined, height: undefined }
            : node
        )), state.edges),
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

        const edges = state.edges.filter((edge) => !removedSet.has(edge.source) && !removedSet.has(edge.target));

        return {
          nodes: normalizeEditorNodes(
            state.nodes.filter((node) => !removedSet.has(node.id)),
            edges,
          ),
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
          state.edges.filter((edge) => edge.id !== edgeId && !cascadeRemovedEdgeIds.has(edge.id)),
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
            nodes: normalizeEditorNodes(nodes, state.edges),
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
          nodes: normalizeEditorNodes(nodes, edges),
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
        const removedIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
        const removedEdges = state.edges.filter((edge) => removedIds.has(edge.id));
        const cascadeRemovedEdgeIds = collectCascadeRemovedGroupEdgeIds(state.nodes, state.edges, removedEdges);
        const allRemovedEdges = state.edges.filter((edge) => removedIds.has(edge.id) || cascadeRemovedEdgeIds.has(edge.id));
        const updatedNodes = removeGroupPortLinksFromNodes(state.nodes, allRemovedEdges);
        const edges = pruneGroupPortEdges(
          updatedNodes,
          applyEdgeChanges(changes, state.edges).filter((edge) => !cascadeRemovedEdgeIds.has(edge.id)),
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
