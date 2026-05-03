// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
} from '@xyflow/react';
import { DEFAULT_WORKFLOW_NAME, getNodeDefaultSize, NODE_REGISTRY } from '@/features/workflow/lib/constants';
import {
  constrainChildNodeToGroupContent,
  constrainChildNodeSizeToGroupContent,
  enforceGroupLayout,
  getEffectiveNodeSize,
  getGroupContentBounds,
  getGroupTopInset,
  GROUP_SAFE_MARGIN,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import * as api from '@/features/workflow/lib/api';
import { groupConfiguredProjectModels, normalizeProjectModels } from '@/features/workflow/lib/projectModels';
import { clearActiveRunSnapshot, loadLocalDraft, saveLocalDraft } from '@/features/workflow/lib/store/persistence';
import type { WorkflowState } from '@/features/workflow/lib/store/types';
import { createWorkflowDocumentActions } from '@/features/workflow/lib/store/document';
import { createWorkflowExecutionActions } from '@/features/workflow/lib/store/execution';
import {
  getDefaultData,
  gid,
  snapValue,
} from '@/features/workflow/lib/store/helpers';

export type {
  ActiveRunSnapshot,
  ExecutionLogEntry,
  NodeExecStatus,
  WorkflowDraftSnapshot,
  WorkflowEditorSnapshot,
  WorkflowImportResult,
  WorkflowState,
} from '@/features/workflow/lib/store/types';

const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);

function getMergeInputCount(node: Node, edges: Edge[]) {
  const nodeDef = NODE_REGISTRY.find((nodeDef) => nodeDef.type === node.type);
  if (!nodeDef?.maxInputs) return null;

  let maxConnectedIdx = 0;
  for (const edge of edges) {
    if (edge.target !== node.id || !edge.targetHandle) continue;

    const idx = Number.parseInt(edge.targetHandle.replace('item', ''), 10);
    if (Number.isFinite(idx) && idx > maxConnectedIdx) {
      maxConnectedIdx = idx;
    }
  }

  return Math.min(nodeDef.maxInputs, Math.max(1, maxConnectedIdx + 1));
}

function normalizeMergeNodeSizes(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    const nextInputCount = getMergeInputCount(node, edges);
    if (nextInputCount === null) return node;

    const minSize = getNodeDefaultSize(node.type || '', nextInputCount);
    const currentInputCount = (node.data.inputCount as number) || 1;
    const nextWidth = typeof node.width === 'number' ? Math.max(node.width, minSize.w) : node.width;
    const nextHeight = typeof node.height === 'number' ? Math.max(node.height, minSize.h) : node.height;

    if (
      currentInputCount === nextInputCount &&
      nextWidth === node.width &&
      nextHeight === node.height
    ) {
      return node;
    }

    return {
      ...node,
      width: nextWidth,
      height: nextHeight,
      data: {
        ...node.data,
        inputCount: nextInputCount,
      },
    };
  });
}


function getAbsolutePosition(nodeId: string, nodeMap: Map<string, Node>, memo = new Map<string, { x: number; y: number }>()) {
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodeMap.get(nodeId);
  if (!node) {
    const fallback = { x: 0, y: 0 };
    memo.set(nodeId, fallback);
    return fallback;
  }

  let position = { x: node.position.x, y: node.position.y };
  const parentId = (node as Node & { parentId?: string }).parentId;
  if (parentId && nodeMap.has(parentId)) {
    const parentPosition = getAbsolutePosition(parentId, nodeMap, memo);
    position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
  }

  memo.set(nodeId, position);
  return position;
}

function getDescendantNodeIds(nodes: Node[], rootIds: string[]) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = (node as Node & { parentId?: string }).parentId;
    if (!parentId) continue;
    const current = byParent.get(parentId) || [];
    current.push(node.id);
    byParent.set(parentId, current);
  }

  const visited = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    for (const childId of byParent.get(currentId) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return [...visited];
}

function expandNodeActionIds(nodes: Node[], nodeIds: string[]) {
  const uniqueIds = [...new Set(nodeIds)].filter((id) => nodes.some((node) => node.id === id));
  if (uniqueIds.length === 0) return [];
  return [...new Set([...uniqueIds, ...getDescendantNodeIds(nodes, uniqueIds)])];
}

function duplicateNodesWithGroups(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const expandedIds = expandNodeActionIds(nodes, nodeIds);
  if (expandedIds.length === 0) return { nodes: [], edges: [] };

  const selectedSet = new Set(expandedIds);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();
  const idMap = new Map<string, string>();

  for (const nodeId of expandedIds) {
    idMap.set(nodeId, `node_${gid()}`);
  }

  const duplicatedNodes = nodes
    .filter((node) => selectedSet.has(node.id))
    .map((node) => {
      const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
      const parentId = (node as Node & { parentId?: string }).parentId;
      const nextParentId = parentId && idMap.has(parentId) ? idMap.get(parentId) : undefined;

      return {
        ...node,
        id: idMap.get(node.id) || `node_${gid()}`,
        position: nextParentId
          ? { ...node.position }
          : {
              x: absolutePosition.x + 48,
              y: absolutePosition.y + 48,
            },
        parentId: nextParentId,
        extent: nextParentId ? 'parent' : undefined,
        selected: true,
      } satisfies Node;
    });

  const duplicatedEdges = edges
    .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `edge_${gid()}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

  return { nodes: duplicatedNodes, edges: duplicatedEdges };
}

function buildGroupForNodes(nodes: Node[], nodeIds: string[]) {
  const targetIds = [...new Set(nodeIds)];
  const selectedNodes = nodes.filter((node) => targetIds.includes(node.id) && node.type !== 'group');
  if (selectedNodes.length < 2) return null;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();
  const contentPaddingX = GROUP_SAFE_MARGIN;
  const contentPaddingTop = getGroupTopInset();
  const contentPaddingBottom = GROUP_SAFE_MARGIN;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of selectedNodes) {
    const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
    const size = getEffectiveNodeSize(node);
    minX = Math.min(minX, absolutePosition.x);
    minY = Math.min(minY, absolutePosition.y);
    maxX = Math.max(maxX, absolutePosition.x + size.width);
    maxY = Math.max(maxY, absolutePosition.y + size.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const minSize = getNodeDefaultSize('group');
  const groupId = `node_${gid()}`;
  const groupPosition = {
    x: snapValue(minX - contentPaddingX),
    y: snapValue(minY - contentPaddingTop),
  };
  const groupWidth = Math.max(minSize.w, snapValue(maxX - minX + contentPaddingX * 2));
  const groupHeight = Math.max(minSize.h, snapValue(maxY - minY + contentPaddingTop + contentPaddingBottom));

  const selectedSet = new Set(selectedNodes.map((node) => node.id));
  const groupNode: Node = {
    id: groupId,
    type: 'group',
    position: groupPosition,
    width: groupWidth,
    height: groupHeight,
    data: { title: `节点组${selectedNodes.length}` },
    selected: true,
  };

  const updatedNodes = nodes.map((node) => {
    if (!selectedSet.has(node.id)) {
      return pushRootNodeOutsideGroupAreas(node, [groupNode, ...nodes]);
    }

    const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
    const bounds = getGroupContentBounds(groupNode, node);
    const relativePosition = {
      x: Math.min(Math.max(absolutePosition.x - groupPosition.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(absolutePosition.y - groupPosition.y, bounds.minY), bounds.maxY),
    };

    return constrainChildNodeToGroupContent({
      ...node,
      position: relativePosition,
      parentId: groupId,
      selected: false,
    } as Node, groupNode);
  });

  return {
    groupNode,
    nodes: enforceGroupLayout([groupNode, ...updatedNodes]),
  };
}

function ungroupNodes(nodes: Node[], groupIds: string[]) {
  const targetGroups = new Set(
    groupIds.filter((id) => nodes.some((node) => node.id === id && node.type === 'group')),
  );
  if (targetGroups.size === 0) return nodes;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();

  return nodes.flatMap((node) => {
    if (targetGroups.has(node.id)) return [];

    const parentId = (node as Node & { parentId?: string }).parentId;
    if (parentId && targetGroups.has(parentId)) {
      const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
      return [{
        ...node,
        parentId: undefined,
        extent: undefined,
        position: absolutePosition,
        selected: true,
      } satisfies Node];
    }

    return [node];
  });
}

const initialDraft = loadLocalDraft();

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: initialDraft?.workflowId || gid(),
  workflowName: initialDraft?.workflowName || DEFAULT_WORKFLOW_NAME,
  workflowList: [],
  isHydratingWorkflow: false,
  isSavingWorkflow: false,
  hasUnsavedChanges: false,
  lastSavedAt: null,
  nodes: initialDraft?.nodes || [],
  edges: initialDraft?.edges || [],
  selectedNodeId: null,
  isExecuting: false,
  executionProgress: null,
  executionMessage: null,
  currentRunId: null,
  executingNodeId: null,
  lastExecutionStatus: null,
  lastExecutionTime: null,
  lastExecutionError: null,
  lastExecutionSummary: null,
  nodeExecStatus: {},
  nodeExecutionTime: {},
  nodeExecutionStartedAt: {},
  nodeErrors: {},
  nodeWarnings: {},
  nodeOutputs: {},
  aiResultOutputs: {},
  executionLogs: [],
  workflowWarningMessage: null,
  availableModels: { all: [], chat: [], image: [], video: [] },
  projectModels: [],
  showDebugSizes: false,
  snapToGridEnabled: false,

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

  duplicateNodes: (nodeIds) => {
    const { nodes: duplicatedNodes, edges: duplicatedEdges } = duplicateNodesWithGroups(
      get().nodes,
      get().edges,
      nodeIds,
    );

    if (duplicatedNodes.length === 0) return [];

    const duplicatedIds = duplicatedNodes.map((node) => node.id);
    set((state) => ({
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        ...duplicatedNodes,
      ],
      edges: [...state.edges, ...duplicatedEdges],
      selectedNodeId: duplicatedIds[0] || null,
      nodeWarnings: {},
      workflowWarningMessage: null,
      hasUnsavedChanges: true,
    }));

    return duplicatedIds;
  },

  createNodeGroup: (nodeIds) => {
    const result = buildGroupForNodes(get().nodes, nodeIds);
    if (!result) return null;

    set(() => ({
      nodes: enforceGroupLayout(result.nodes),
      selectedNodeId: result.groupNode.id,
      nodeWarnings: {},
      workflowWarningMessage: null,
      hasUnsavedChanges: true,
    }));

    return result.groupNode.id;
  },

  ungroupNodes: (groupIds) => {
    const nextNodes = ungroupNodes(get().nodes, groupIds);
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
      nodes: enforceGroupLayout(releasedNodes),
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

  onNodesChange: (changes) => {
    set((state) => {
      const removedIds = expandNodeActionIds(
        state.nodes,
        changes
        .filter((change) => change.type === 'remove')
          .map((change) => change.id),
      );
      const filteredChanges = removedIds.length > 0
        ? changes.filter((change) => !(change.type === 'remove' && removedIds.includes(change.id)))
        : changes;
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

  setNodeExecStatus: (nodeId, status, error) => {
    set((state) => ({
      nodeExecStatus: { ...state.nodeExecStatus, [nodeId]: status },
      nodeExecutionStartedAt: status === 'running'
        ? { ...state.nodeExecutionStartedAt, [nodeId]: Date.now() }
        : state.nodeExecutionStartedAt,
      nodeErrors: error ? { ...state.nodeErrors, [nodeId]: error } : state.nodeErrors,
    }));
  },

  clearAllExecStatus: () => set({
    nodeExecStatus: {},
    nodeExecutionTime: {},
    nodeExecutionStartedAt: {},
    nodeErrors: {},
    nodeWarnings: {},
    workflowWarningMessage: null,
  }),

  setExecuting: (executing, progress) => {
    set({
      isExecuting: executing,
      executionProgress: progress || null,
      executionMessage: executing ? '准备执行工作流...' : null,
      currentRunId: executing ? get().currentRunId : null,
      executingNodeId: executing ? get().executingNodeId : null,
    });
  },

  setExecutionResult: (status, time, error) => {
    clearActiveRunSnapshot();
    set({
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      currentRunId: null,
      executingNodeId: null,
      lastExecutionStatus: status,
      lastExecutionTime: time ?? null,
      lastExecutionError: error ?? null,
    });
  },


  addExecutionLog: (log) => {
    set((state) => ({
      executionLogs: [
        ...state.executionLogs.slice(-299),
        {
          id: `log_${gid()}`,
          timestamp: Date.now(),
          ...log,
        },
      ],
    }));
  },

  clearExecutionLogs: () => set({ executionLogs: [] }),

  applyEditorSnapshot: (snapshot, markDirty = true) => {
    clearActiveRunSnapshot();
    set({
      workflowId: snapshot.workflowId,
      workflowName: snapshot.workflowName,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      selectedNodeId: snapshot.selectedNodeId,
      hasUnsavedChanges: markDirty,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      currentRunId: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeExecutionTime: {},
      nodeExecutionStartedAt: {},
      nodeErrors: {},
      nodeWarnings: {},
      nodeOutputs: {},
      aiResultOutputs: {},
      executionLogs: [],
      workflowWarningMessage: null,
    });
  },

  newWorkflow: () => {
    clearActiveRunSnapshot();
    set({
      workflowId: gid(),
      workflowName: DEFAULT_WORKFLOW_NAME,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      currentRunId: null,
      executingNodeId: null,
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
      nodeExecStatus: {},
      nodeExecutionTime: {},
      nodeExecutionStartedAt: {},
      nodeErrors: {},
      nodeWarnings: {},
      nodeOutputs: {},
      aiResultOutputs: {},
      executionLogs: [],
      workflowWarningMessage: null,
      hasUnsavedChanges: false,
      lastSavedAt: null,
    });
  },

  markWorkflowDirty: () => set({ hasUnsavedChanges: true }),

  setShowDebugSizes: (show) => set({ showDebugSizes: show }),
  setSnapToGridEnabled: (enabled) => set({ snapToGridEnabled: enabled }),

  fetchModels: async () => {
    const result = await api.fetchAvailableModels();
    if (result.success && result.data) {
      const nextModels = {
        all: result.data.all || [],
        chat: result.data.chat || [],
        image: result.data.image || [],
        video: result.data.video || [],
      };

      set({
        availableModels: {
          all: nextModels.all,
          chat: nextModels.chat,
          image: nextModels.image,
          video: nextModels.video,
        },
      });

      return { success: true, count: nextModels.all.length };
    }

    return { success: false, error: result.error || '获取模型列表失败', count: 0 };
  },

  setAvailableModels: (models) => set({ availableModels: models }),

  setProjectModels: (models) => set({
    projectModels: normalizeProjectModels(models),
    availableModels: groupConfiguredProjectModels(normalizeProjectModels(models)),
  }),

  persistLocalDraft: () => {
    const state = get();
    saveLocalDraft({
      workflowId: state.workflowId,
      workflowName: state.workflowName,
      nodes: state.nodes,
      edges: state.edges,
    });
  },
  ...createWorkflowExecutionActions(set, get),
  ...createWorkflowDocumentActions(set, get, { initialDraft }),
}));

