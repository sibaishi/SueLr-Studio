import type { WorkflowListItem } from '@/domains/workflow/lib/api/workflows';
import type { GroupPort, GroupPortSide } from '@/domains/workflow/lib/groupPorts';
import type {
  PersistedWorkflow,
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/lib/persistenceTypes';
import type { ModelOption, ProjectModel } from '@/domains/workflow/lib/projectModels';
import type { ApiConfig } from '@/shared/types';
import type { Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';

export type WorkflowDraftSnapshot = {
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
};

export type ActiveRunSnapshot = {
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

export type WorkflowDocumentOrigin = 'new' | 'saved' | 'imported';

export type WorkflowDocument = {
  documentId: string;
  workflowId: string;
  sourceWorkflowId?: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  origin: WorkflowDocumentOrigin;
  isExecuting: boolean;
  executionProgress: { current: number; total: number } | null;
  executionMessage: string | null;
  currentRunId: string | null;
  lastExecutionRunId: string | null;
  executingNodeId: string | null;
  lastExecutionStatus: 'success' | 'error' | null;
  lastExecutionTime: number | null;
  lastExecutionError: string | null;
  lastExecutionSummary: { successCount: number; failCount: number; totalDuration: number } | null;
  nodeExecStatus: Record<string, NodeExecStatus>;
  nodeExecutionTime: Record<string, number>;
  nodeExecutionStartedAt: Record<string, number>;
  nodeExecutionActiveCounts: Record<string, number>;
  nodeExecutionStartedCounts: Record<string, number>;
  nodeExecutionCompletedCounts: Record<string, number>;
  nodeExecutionExpectedCounts: Record<string, number>;
  nodeErrors: Record<string, string>;
  nodeWarnings: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  aiResultOutputs: Record<string, Record<string, unknown>>;
  executionLogs: ExecutionLogEntry[];
  workflowWarningMessage: string | null;
};

export type WorkflowImportResult = {
  success: boolean;
  report: WorkflowImportReport | null;
  error?: WorkflowImportError | null;
};

export type WorkflowOperationCode =
  | 'WORKFLOW_SAVE_FAILED'
  | 'WORKFLOW_LOAD_FAILED'
  | 'WORKFLOW_DELETE_FAILED'
  | 'WORKFLOW_DUPLICATE_FAILED'
  | 'WORKFLOW_IMPORT_FAILED'
  | 'WORKFLOW_CONFLICT'
  | 'WORKFLOW_VALIDATION_FAILED';

export type WorkflowOperationResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; code: WorkflowOperationCode; message: string; status?: number; details?: unknown };

export type NodeExecStatus = 'idle' | 'running' | 'success' | 'error';

export interface ExecutionLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'error';
  message: string;
  nodeId?: string;
  details?: unknown;
}

export interface WorkflowState {
  documents: WorkflowDocument[];
  activeDocumentId: string;
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
  lastExecutionRunId: string | null;
  executingNodeId: string | null;
  lastExecutionStatus: 'success' | 'error' | null;
  lastExecutionTime: number | null;
  lastExecutionError: string | null;
  lastExecutionSummary: { successCount: number; failCount: number; totalDuration: number } | null;
  nodeExecStatus: Record<string, NodeExecStatus>;
  nodeExecutionTime: Record<string, number>;
  nodeExecutionStartedAt: Record<string, number>;
  nodeExecutionActiveCounts: Record<string, number>;
  nodeExecutionStartedCounts: Record<string, number>;
  nodeExecutionCompletedCounts: Record<string, number>;
  nodeExecutionExpectedCounts: Record<string, number>;
  nodeErrors: Record<string, string>;
  nodeWarnings: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  aiResultOutputs: Record<string, Record<string, unknown>>;
  executionLogs: ExecutionLogEntry[];
  workflowWarningMessage: string | null;
  availableModels: {
    all: ModelOption[];
    chat: ModelOption[];
    image: ModelOption[];
    video: ModelOption[];
  };
  workflowRuntimeConfigs: ApiConfig[];
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
  removeNodeWithoutReconnect: (nodeId: string) => void;
  removeNodesWithoutReconnect: (nodeIds: string[]) => void;
  detachNodeFromChain: (nodeId: string) => void;
  insertNodeOnEdge: (nodeId: string, edgeId: string) => void;
  addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void;
  removeEdge: (edgeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  duplicateNodes: (nodeIds: string[]) => string[];
  autoArrangeWorkflow: () => void;
  createNodeGroup: (nodeIds: string[]) => string | null;
  toggleGroupCollapsed: (groupId: string, collapsed?: boolean) => void;
  updateGroupPort: (groupId: string, side: GroupPortSide, portId: string, patch: Partial<GroupPort>) => void;
  ungroupNodes: (groupIds: string[]) => void;
  releaseNodesFromGroup: (nodeIds: string[]) => void;
  toggleNodesLocked: (nodeIds: string[], locked?: boolean) => void;
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
  resetUserWorkspace: () => void;
  setActiveWorkflowDocument: (documentId: string) => void;
  closeWorkflowDocument: (documentId: string, options?: { discardUnsaved?: boolean }) => Promise<boolean>;
  createWorkflowDocument: (options?: { origin?: WorkflowDocumentOrigin; name?: string }) => void;

  executeWorkflow: () => Promise<void>;
  executeWorkflowToNode: (nodeId: string) => Promise<void>;
  cancelWorkflowExecution: () => Promise<void>;
  saveWorkflow: () => Promise<boolean>;
  loadWorkflow: (id: string) => Promise<boolean>;
  fetchWorkflowList: () => Promise<void>;
  initializeWorkflowPersistence: () => Promise<void>;
  restoreExecutionRun: () => Promise<void>;
  syncExecutionRunStatus: () => Promise<void>;
  saveWorkflowDetailed: () => Promise<WorkflowOperationResult<{ workflowId: string }>>;
  duplicateCurrentWorkflow: () => Promise<boolean>;
  duplicateCurrentWorkflowDetailed: () => Promise<WorkflowOperationResult<{ workflowId: string }>>;
  deleteCurrentWorkflow: () => Promise<boolean>;
  deleteCurrentWorkflowDetailed: () => Promise<WorkflowOperationResult<{ workflowId?: string }>>;
  loadWorkflowDetailed: (id: string) => Promise<WorkflowOperationResult<{ workflowId: string }>>;
  exportCurrentWorkflow: () => PersistedWorkflow;
  importWorkflowData: (payload: unknown, fallbackName?: string) => Promise<WorkflowImportResult>;
  importWorkflowDataWithMode: (
    payload: unknown,
    mode: WorkflowImportMode,
    fallbackName?: string,
  ) => Promise<WorkflowImportResult>;
  fetchModels: () => Promise<{ success: boolean; error?: string; count: number }>;
  setAvailableModels: (models: {
    all: ModelOption[];
    chat: ModelOption[];
    image: ModelOption[];
    video: ModelOption[];
  }) => void;
  setProjectModels: (models: ProjectModel[]) => void;
  persistLocalDraft: () => void;
}

export type WorkflowStoreSet = (
  partial: Partial<WorkflowState> | ((state: WorkflowState) => Partial<WorkflowState>),
) => void;

export type WorkflowStoreGet = () => WorkflowState;
