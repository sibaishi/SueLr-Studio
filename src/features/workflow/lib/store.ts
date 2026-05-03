// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { DEFAULT_WORKFLOW_NAME, getNodeDefaultSize, GRID_SIZE, NODE_REGISTRY } from '@/features/workflow/lib/constants';
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
import type { WorkflowListItem } from '@/features/workflow/lib/api';
import type { PersistedWorkflow, WorkflowImportError, WorkflowImportMode, WorkflowImportReport } from '@/domains/workflow/types';
import type { Workflow } from '@/features/workflow/lib/types';
import { groupConfiguredProjectModels, normalizeProjectModels, type ProjectModel } from '@/features/workflow/lib/projectModels';

function gid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

const LOCAL_DRAFT_KEY = 'flow-studio-local-draft';
const ACTIVE_RUN_KEY = 'flow-studio-active-run';
const AI_TYPES = ['aiChat', 'imageGen', 'videoGen'];
const OUTPUT_NODE_TYPES = new Set(['output', 'saveFile']);
const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);

type WorkflowDraftSnapshot = {
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
};

type ActiveRunSnapshot = {
  runId: string;
  workflowId: string;
  source?: string;
  snapshotVersion?: number;
};

export type WorkflowEditorSnapshot = {
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
};

type WorkflowImportResult = {
  success: boolean;
  report: WorkflowImportReport | null;
  error?: WorkflowImportError | null;
};

function loadLocalDraft(): WorkflowDraftSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkflowDraftSnapshot>;
    if (
      !parsed ||
      typeof parsed.workflowId !== 'string' ||
      typeof parsed.workflowName !== 'string' ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }

    return {
      workflowId: parsed.workflowId,
      workflowName: parsed.workflowName,
      nodes: parsed.nodes as Node[],
      edges: parsed.edges as Edge[],
    };
  } catch {
    return null;
  }
}

function saveLocalDraft(snapshot: WorkflowDraftSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore local draft persistence failures.
  }
}

function getDefaultData(nodeType: string): Record<string, unknown> {
  const def = NODE_REGISTRY.find((nodeDef) => nodeDef.type === nodeType);
  if (!def) return {};

  const data: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      data[param.id] = param.default;
    }
  }
  return data;
}

function getNodeTypeLabel(nodeType: string): string {
  return NODE_REGISTRY.find((nodeDef) => nodeDef.type === nodeType)?.label || nodeType || '未知节点';
}

function getNodeDisplayName(node: Pick<Node, 'id' | 'type'> | undefined, nodes: Node[]): string {
  if (!node) return '未知节点';
  const baseLabel = getNodeTypeLabel(node.type || '');
  const sameTypeNodes = nodes.filter((item) => item.type === node.type);
  if (sameTypeNodes.length <= 1) return baseLabel;
  const index = sameTypeNodes.findIndex((item) => item.id === node.id);
  return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
}

function getNodeDisplayNameById(nodeId: string, nodes: Node[]): string {
  return getNodeDisplayName(nodes.find((node) => node.id === nodeId), nodes);
}

function formatLogDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function loadActiveRunSnapshot(): ActiveRunSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ActiveRunSnapshot>;
    if (!parsed || typeof parsed.runId !== 'string' || typeof parsed.workflowId !== 'string') {
      return null;
    }

    return {
      runId: parsed.runId,
      workflowId: parsed.workflowId,
      source: typeof parsed.source === 'string' ? parsed.source : undefined,
      snapshotVersion: typeof parsed.snapshotVersion === 'number' ? parsed.snapshotVersion : undefined,
    };
  } catch {
    return null;
  }
}

function saveActiveRunSnapshot(snapshot: ActiveRunSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore active run persistence failures.
  }
}

function clearActiveRunSnapshot() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(ACTIVE_RUN_KEY);
  } catch {
    // Ignore active run persistence failures.
  }
}

function sanitizeNodeData(nodeType: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object') return getDefaultData(nodeType);

  const nextData = { ...getDefaultData(nodeType), ...data };
  delete nextData.videoMode;
  if (FORCE_DISABLED_NODE_TYPES.has(nodeType)) nextData.disabled = true;
  return nextData;
}

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

function normalizeNodes(input: unknown): Node[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.type !== 'string') return [];

    const positionRecord = record.position as Record<string, unknown> | undefined;
    const x = typeof positionRecord?.x === 'number' ? positionRecord.x : 0;
    const y = typeof positionRecord?.y === 'number' ? positionRecord.y : 0;

    return [{
      id: record.id,
      type: record.type,
      position: { x, y },
      width: typeof (record.ui as Record<string, unknown> | undefined)?.width === 'number'
        ? (record.ui as Record<string, unknown>).width as number
        : typeof record.width === 'number' ? record.width : undefined,
      height: typeof (record.ui as Record<string, unknown> | undefined)?.height === 'number'
        ? (record.ui as Record<string, unknown>).height as number
        : typeof record.height === 'number' ? record.height : undefined,
      parentId: typeof (record.ui as Record<string, unknown> | undefined)?.parentId === 'string'
        ? (record.ui as Record<string, unknown>).parentId as string
        : typeof record.parentId === 'string' ? record.parentId : undefined,
      extent:
        (record.ui as Record<string, unknown> | undefined)?.extent === 'parent' ||
        record.extent === 'parent' ||
        (
          Array.isArray(record.extent) &&
          record.extent.length === 2 &&
          Array.isArray(record.extent[0]) &&
          Array.isArray(record.extent[1])
        )
          ? record.extent as Node['extent']
          : undefined,
      data: {
        ...sanitizeNodeData(
          record.type,
          record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {},
        ),
      },
    }];
  });
}

function normalizeEdges(input: unknown, validNodeIds: Set<string>): Edge[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    if (typeof record.source !== 'string' || typeof record.target !== 'string') return [];
    if (!validNodeIds.has(record.source) || !validNodeIds.has(record.target)) return [];

    return [{
      id: typeof record.id === 'string' ? record.id : `edge_${gid()}`,
      source: record.source,
      sourceHandle: typeof record.sourceHandle === 'string' ? record.sourceHandle : null,
      target: record.target,
      targetHandle: typeof record.targetHandle === 'string' ? record.targetHandle : null,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 2 },
    }];
  });
}

function buildWorkflowPayload(
  workflowId: string,
  workflowName: string,
  nodes: Node[],
  edges: Edge[]
): PersistedWorkflow {
  return {
    id: workflowId,
    name: workflowName,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type || '',
      version: 1,
      position: node.position,
      data: sanitizeNodeData(node.type || '', node.data as Record<string, unknown>),
      ui: {
        ...(typeof node.width === 'number' ? { width: node.width } : {}),
        ...(typeof node.height === 'number' ? { height: node.height } : {}),
        ...((node as Node & { parentId?: string }).parentId ? { parentId: (node as Node & { parentId?: string }).parentId } : {}),
        ...(typeof (node as Node & { extent?: unknown }).extent === 'string' ? { extent: (node as Node & { extent?: string }).extent } : {}),
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      ...(typeof edge.sourceHandle === 'string' ? { sourceHandle: edge.sourceHandle } : {}),
      target: edge.target,
      ...(typeof edge.targetHandle === 'string' ? { targetHandle: edge.targetHandle } : {}),
    })),
    settings: {},
  };
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

function getAiNodesMissingValidOutputs(nodes: Node[], edges: Edge[]) {
  const adjacency = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const current = adjacency.get(edge.source) || [];
    current.push(edge.target);
    adjacency.set(edge.source, current);
  }

  const activeAiNodes = nodes.filter((node) => AI_TYPES.includes(node.type || '') && !Boolean(node.data?.disabled));

  return activeAiNodes.filter((aiNode) => {
    const visited = new Set<string>();
    const queue = [...(adjacency.get(aiNode.id) || [])];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodeById.get(currentId);
      if (!currentNode) continue;

      if (OUTPUT_NODE_TYPES.has(currentNode.type || '') && !Boolean(currentNode.data?.disabled)) {
        return false;
      }

      for (const nextId of adjacency.get(currentId) || []) {
        queue.push(nextId);
      }
    }

    return true;
  });
}

export type NodeExecStatus = 'idle' | 'running' | 'success' | 'error';

export interface ExecutionLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'error';
  message: string;
  nodeId?: string;
  details?: unknown;
}

interface WorkflowState {
  workflowId: string;
  workflowName: string;
  workflowList: WorkflowListItem[];
  isHydratingWorkflow: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionProgress: { current: number; total: number } | null;
  executionMessage: string | null;
  currentRunId: string | null;
  executingNodeId: string | null;
  lastExecutionStatus: 'success' | 'error' | null;
  lastExecutionTime: number | null;
  lastExecutionError: string | null;
  lastExecutionSummary: { successCount: number; failCount: number; totalDuration: number } | null;
  nodeExecStatus: Record<string, NodeExecStatus>;
  nodeExecutionTime: Record<string, number>;
  nodeExecutionStartedAt: Record<string, number>;
  nodeErrors: Record<string, string>;
  nodeWarnings: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  aiResultOutputs: Record<string, Record<string, unknown>>;
  executionLogs: ExecutionLogEntry[];
  workflowWarningMessage: string | null;
  availableModels: {
    all: string[];
    chat: string[];
    image: string[];
    video: string[];
  };
  projectModels: ProjectModel[];
  showDebugSizes: boolean;
  snapToGridEnabled: boolean;

  setWorkflowName: (name: string) => void;
  addNode: (type: string, position: { x: number; y: number }, data?: Record<string, unknown>) => string;
  duplicateNode: (nodeId: string) => string | null;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  setNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  resetNodeSize: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;
  removeNodes: (nodeIds: string[]) => void;
  addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void;
  removeEdge: (edgeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  duplicateNodes: (nodeIds: string[]) => string[];
  createNodeGroup: (nodeIds: string[]) => string | null;
  ungroupNodes: (groupIds: string[]) => void;
  releaseNodesFromGroup: (nodeIds: string[]) => void;
  toggleNodesDisabled: (nodeIds: string[], disabled?: boolean) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodeExecStatus: (nodeId: string, status: NodeExecStatus, error?: string) => void;
  clearAllExecStatus: () => void;
  setExecuting: (executing: boolean, progress?: { current: number; total: number }) => void;
  setExecutionResult: (status: 'success' | 'error', time?: number, error?: string) => void;
  addExecutionLog: (log: Omit<ExecutionLogEntry, 'id' | 'timestamp'>) => void;
  clearExecutionLogs: () => void;
  applyEditorSnapshot: (snapshot: WorkflowEditorSnapshot, markDirty?: boolean) => void;
  newWorkflow: () => void;
  markWorkflowDirty: () => void;
  setShowDebugSizes: (show: boolean) => void;
  setSnapToGridEnabled: (enabled: boolean) => void;

  executeWorkflow: () => Promise<void>;
  cancelWorkflowExecution: () => Promise<void>;
  saveWorkflow: () => Promise<boolean>;
  loadWorkflow: (id: string) => Promise<boolean>;
  fetchWorkflowList: () => Promise<void>;
  initializeWorkflowPersistence: () => Promise<void>;
  restoreExecutionRun: () => Promise<void>;
  syncExecutionRunStatus: () => Promise<void>;
  duplicateCurrentWorkflow: () => Promise<boolean>;
  deleteCurrentWorkflow: () => Promise<boolean>;
  exportCurrentWorkflow: () => PersistedWorkflow;
  importWorkflowData: (payload: unknown, fallbackName?: string) => Promise<WorkflowImportResult>;
  importWorkflowDataWithMode: (payload: unknown, mode: WorkflowImportMode, fallbackName?: string) => Promise<WorkflowImportResult>;
  fetchModels: () => Promise<{ success: boolean; error?: string; count: number }>;
  setAvailableModels: (models: { all: string[]; chat: string[]; image: string[]; video: string[] }) => void;
  setProjectModels: (models: ProjectModel[]) => void;
  persistLocalDraft: () => void;
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

  executeWorkflow: async () => {
    const state = get();
    if (state.isExecuting || state.nodes.length === 0) return;

    const aiNodesMissingOutputs = getAiNodesMissingValidOutputs(state.nodes, state.edges);
    if (aiNodesMissingOutputs.length > 0) {
      const labels = aiNodesMissingOutputs.map((node) => getNodeDisplayName(node, state.nodes));
      const nodeWarnings = Object.fromEntries(
        aiNodesMissingOutputs.map((node) => [
          node.id,
          '后方未连接有效且未被禁用的输出节点',
        ]),
      );

      set({
        lastExecutionStatus: 'error',
        lastExecutionError: `以下 AI 节点后方未连接有效且未被禁用的输出节点：${labels.join('、')}`,
        nodeWarnings,
        workflowWarningMessage: `无法启动工作流：${labels.length} 个 AI 节点未连接有效输出`,
      });
      return;
    }

    set({
      executionProgress: null,
      isExecuting: true,
      executionMessage: '准备执行工作流...',
      currentRunId: null,
      executingNodeId: null,
      nodeExecStatus: {},
      nodeExecutionTime: {},
      nodeExecutionStartedAt: {},
      nodeErrors: {},
      nodeWarnings: {},
      nodeOutputs: {},
      aiResultOutputs: {},
      workflowWarningMessage: null,
      executionLogs: [{
        id: `log_${gid()}`,
        timestamp: Date.now(),
        level: 'info',
        message: `开始执行工作流：${state.workflowName}`,
        details: { nodeCount: state.nodes.length, edgeCount: state.edges.length },
      }],
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
    });

    const payload = buildWorkflowPayload(
      state.workflowId,
      state.workflowName,
      state.nodes,
      state.edges
    );

    const saved = await get().saveWorkflow();
    if (!saved) {
      clearActiveRunSnapshot();
      get().addExecutionLog({
        level: 'error',
        message: '工作流保存失败，已取消执行',
      });
      set({
        isExecuting: false,
        executionProgress: null,
        executionMessage: '工作流保存失败，未启动执行',
        currentRunId: null,
        executingNodeId: null,
        lastExecutionStatus: 'error',
        lastExecutionError: '工作流保存失败，未启动执行',
      });
      return;
    }

    await api.executeWorkflow(state.workflowId, { nodes: payload.nodes, edges: payload.edges }, {
      onNodeStart: (data) => {
        const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
        get().addExecutionLog({
          level: 'info',
          message: `开始节点：${nodeLabel} (${data.index + 1}/${data.total})`,
          nodeId: data.nodeId,
          details: data,
        });
        set((currentState) => ({
          executionProgress: { current: data.index + 1, total: data.total },
          executionMessage: `正在执行：${nodeLabel}`,
          executingNodeId: data.nodeId,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'running',
          },
          nodeExecutionStartedAt: {
            ...currentState.nodeExecutionStartedAt,
            [data.nodeId]: Date.now(),
          },
          nodeExecutionTime: {
            ...currentState.nodeExecutionTime,
            [data.nodeId]: 0,
          },
        }));
      },
      onNodeProgress: (data) => {
        const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
        get().addExecutionLog({
          level: 'info',
          message: data.message || `${nodeLabel} 执行中...`,
          nodeId: data.nodeId,
          details: formatLogDetails(data.message || data),
        });
        set({
          executionMessage: `正在执行：${nodeLabel}`,
          executingNodeId: data.nodeId,
        });
      },
      onNodeComplete: (data) => {
        const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
        get().addExecutionLog({
          level: 'success',
          message: `节点完成：${nodeLabel} (${data.duration} ms)`,
          nodeId: data.nodeId,
          details: formatLogDetails(data.outputs),
        });
        set((currentState) => ({
          executionMessage: `${nodeLabel} 执行完成`,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'success',
          },
          nodeExecutionTime: {
            ...currentState.nodeExecutionTime,
            [data.nodeId]: data.duration,
          },
          nodeOutputs: {
            ...currentState.nodeOutputs,
            [data.nodeId]: data.outputs,
          },
          aiResultOutputs: AI_TYPES.includes(currentState.nodes.find((node) => node.id === data.nodeId)?.type || '')
            ? {
                ...currentState.aiResultOutputs,
                [data.nodeId]: data.outputs,
              }
            : currentState.aiResultOutputs,
        }));
      },
      onNodeError: (data) => {
        const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
        get().addExecutionLog({
          level: 'error',
          message: `节点失败：${nodeLabel}`,
          nodeId: data.nodeId,
          details: formatLogDetails(data.error),
        });
        set((currentState) => ({
          executionMessage: `${nodeLabel} 执行失败`,
          nodeExecStatus: {
            ...currentState.nodeExecStatus,
            [data.nodeId]: 'error',
          },
          nodeExecutionTime: {
            ...currentState.nodeExecutionTime,
            [data.nodeId]: currentState.nodeExecutionStartedAt[data.nodeId]
              ? Math.max(0, Date.now() - currentState.nodeExecutionStartedAt[data.nodeId])
              : 0,
          },
          nodeErrors: {
            ...currentState.nodeErrors,
            [data.nodeId]: data.error,
          },
        }));
      },
      onWorkflowLog: (data) => {
        get().addExecutionLog({
          level: 'info',
          message: '执行日志已建立',
          details: formatLogDetails(data),
        });
      },
      onSnapshotBuilt: (data) => {
        get().addExecutionLog({
          level: 'info',
          message: '执行快照已构建',
          details: formatLogDetails(data),
        });
      },
      onRunStarted: (data) => {
        saveActiveRunSnapshot({
          runId: data.runId,
          workflowId: data.workflowId,
          source: data.source,
          snapshotVersion: data.snapshotVersion,
        });
        set({ currentRunId: data.runId });
        get().addExecutionLog({
          level: 'info',
          message: '执行运行已启动',
          details: formatLogDetails(data),
        });
      },
      onWorkflowComplete: (data) => {
        clearActiveRunSnapshot();
        get().addExecutionLog({
          level: data.failCount > 0 ? 'error' : 'success',
          message: `工作流完成：${data.successCount} 成功 / ${data.failCount} 失败 (${data.totalDuration} ms)`,
          details: formatLogDetails(data),
        });
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: data.failCount > 0 ? '工作流执行完成，但有节点失败' : '工作流执行完成',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: data.failCount > 0 ? 'error' : 'success',
          lastExecutionTime: data.totalDuration,
          lastExecutionSummary: {
            successCount: data.successCount,
            failCount: data.failCount,
            totalDuration: data.totalDuration,
          },
        });
      },
      onWorkflowError: (data) => {
        clearActiveRunSnapshot();
        get().addExecutionLog({
          level: 'error',
          message: '工作流失败',
          details: formatLogDetails(data.error),
        });
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: '工作流执行失败',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionError: data.error || '未知错误',
          lastExecutionSummary: null,
        });
      },
    });
  },

  cancelWorkflowExecution: async () => {
    const state = get();
    if (!state.isExecuting) return;

    get().addExecutionLog({
      level: 'info',
      message: '用户请求停止工作流',
    });

    set({
      executionMessage: '正在停止工作流...',
    });

    try {
      if (!state.currentRunId) {
        clearActiveRunSnapshot();
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: '工作流执行已停止',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionError: '没有可取消的运行 ID',
        });
        return;
      }
      await api.cancelExecution(state.currentRunId);
    } catch {
      // Ignore cancellation request failures here; the SSE channel will settle the final state.
    }
  },

  saveWorkflow: async () => {
    const state = get();
    set({ isSavingWorkflow: true });

    const workflowData = buildWorkflowPayload(
      state.workflowId,
      state.workflowName,
      state.nodes,
      state.edges
    );

    const updateResult = await api.updateWorkflow(state.workflowId, workflowData);
    if (updateResult.success) {
      await get().fetchWorkflowList();
      set({
        isSavingWorkflow: false,
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
      });
      get().persistLocalDraft();
      return true;
    }

    const createResult = await api.createWorkflow(workflowData);
    if (createResult.success && createResult.data) {
      const savedWorkflow = createResult.data as Workflow;
      const savedId = typeof savedWorkflow.id === 'string' ? savedWorkflow.id : state.workflowId;

      set({
        workflowId: savedId,
        isSavingWorkflow: false,
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
      });
      await get().fetchWorkflowList();
      get().persistLocalDraft();
      return true;
    }

    set({ isSavingWorkflow: false });
    return false;
  },

  loadWorkflow: async (id) => {
    clearActiveRunSnapshot();
    const result = await api.fetchWorkflow(id);
    if (!result.success || !result.data) return false;

    const workflow = result.data as Workflow;
    const nodes = normalizeNodes(workflow.nodes);
    const edges = normalizeEdges(workflow.edges, new Set(nodes.map((node) => node.id)));

    set({
      workflowId: id,
      workflowName: typeof workflow.name === 'string' ? workflow.name : DEFAULT_WORKFLOW_NAME,
      nodes,
      edges,
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
      nodeOutputs: {},
      aiResultOutputs: {},
      hasUnsavedChanges: false,
      lastSavedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
    });

    get().persistLocalDraft();
    return true;
  },

  fetchWorkflowList: async () => {
    const result = await api.fetchWorkflows();
    if (result.success && result.data) {
      set({ workflowList: result.data });
    }
  },

  initializeWorkflowPersistence: async () => {
    set({ isHydratingWorkflow: true });
    await get().fetchWorkflowList();

    const workflowList = get().workflowList;
    if (!initialDraft && workflowList.length > 0) {
      await get().loadWorkflow(workflowList[0].id);
    }

    set({ isHydratingWorkflow: false });
  },

  restoreExecutionRun: async () => {
    const activeRun = loadActiveRunSnapshot();
    if (!activeRun) return;

    const statusResult = await api.fetchExecutionStatus(activeRun.runId);
    if (!statusResult.success || !statusResult.data || statusResult.data.status !== 'running') {
      clearActiveRunSnapshot();
      return;
    }

    const status = statusResult.data;
    if (status.workflowId && status.workflowId !== get().workflowId) {
      await get().loadWorkflow(status.workflowId);
    }

    set((state) => ({
      isExecuting: true,
      executionMessage: state.executionMessage || '已恢复工作流执行状态...',
      currentRunId: status.runId,
      lastExecutionStatus: null,
      lastExecutionError: null,
    }));

    get().addExecutionLog({
      level: 'info',
      message: '已恢复执行运行状态',
      details: formatLogDetails(status),
    });
  },

  syncExecutionRunStatus: async () => {
    const state = get();
    if (!state.currentRunId) return;

    const statusResult = await api.fetchExecutionStatus(state.currentRunId);
    if (!statusResult.success || !statusResult.data) return;

    if (statusResult.data.status === 'running') {
      if (!state.isExecuting) {
        set({
          isExecuting: true,
          executionMessage: '已重新连接到工作流执行...',
        });
      }
      return;
    }

    clearActiveRunSnapshot();
    get().addExecutionLog({
      level: 'info',
      message: `执行运行状态已同步为 ${statusResult.data.status}`,
      details: formatLogDetails(statusResult.data),
    });
    set({
      isExecuting: false,
      executionProgress: null,
      executionMessage: null,
      currentRunId: null,
      executingNodeId: null,
    });
  },

  duplicateCurrentWorkflow: async () => {
    const state = get();
    const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

    if (!existsInList) {
      const result = await api.createWorkflow({
        ...buildWorkflowPayload(
          `wf_${Date.now()}`,
          `${state.workflowName} (副本)`,
          state.nodes,
          state.edges
        ),
      });

      if (!result.success || !result.data) return false;

      const newId = (result.data as Workflow).id;
      await get().fetchWorkflowList();
      return get().loadWorkflow(newId);
    }

    const result = await api.duplicateWorkflow(state.workflowId);
    if (!result.success || !result.data) return false;

    const newId = (result.data as Record<string, unknown>).id as string;
    await get().fetchWorkflowList();
    return get().loadWorkflow(newId);
  },

  deleteCurrentWorkflow: async () => {
    const state = get();
    const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

    if (existsInList) {
      const result = await api.deleteWorkflow(state.workflowId);
      if (!result.success) return false;
    }

    await get().fetchWorkflowList();
    const nextWorkflow = get().workflowList[0];

    if (nextWorkflow) {
      return get().loadWorkflow(nextWorkflow.id);
    }

    get().newWorkflow();
    get().persistLocalDraft();
    return true;
  },

  exportCurrentWorkflow: () => {
    const state = get();
    return buildWorkflowPayload(state.workflowId, state.workflowName, state.nodes, state.edges);
  },

  importWorkflowDataWithMode: async (payload, mode, fallbackName) => {
    if (!payload || typeof payload !== 'object') {
      return { success: false, report: null, error: { message: '导入失败：文件格式不正确。' } };
    }

    const importResult = await api.importWorkflow(payload as Record<string, unknown>, mode);
    if (!importResult.success || !importResult.data) {
      return {
        success: false,
        report: null,
        error: (importResult as { importError?: WorkflowImportError }).importError || { message: importResult.error || '导入失败' },
      };
    }

    const record = importResult.data as Workflow;
    const nodes = normalizeNodes(record.nodes);
    const edges = normalizeEdges(record.edges, new Set(nodes.map((node) => node.id)));
    const importedName = typeof record.name === 'string'
      ? record.name
      : fallbackName || DEFAULT_WORKFLOW_NAME;

    clearActiveRunSnapshot();
    set({
      workflowId: typeof record.id === 'string' ? record.id : gid(),
      workflowName: importedName,
      nodes,
      edges,
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
      nodeOutputs: {},
      aiResultOutputs: {},
      hasUnsavedChanges: true,
      lastSavedAt: null,
    });

    get().persistLocalDraft();
    return {
      success: true,
      report: (importResult as { report?: WorkflowImportReport }).report || null,
      error: null,
    };
  },

  importWorkflowData: async (payload, fallbackName) => {
    return get().importWorkflowDataWithMode(payload, 'generate_new_id', fallbackName);
  },

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
}));

