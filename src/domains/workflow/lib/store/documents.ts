import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { gid } from '@/domains/workflow/lib/store/helpers';
import type {
  WorkflowDocument,
  WorkflowDocumentOrigin,
  WorkflowState,
  WorkflowStoreGet,
  WorkflowStoreSet,
} from '@/domains/workflow/lib/store/types';
import type { Edge, Node } from '@xyflow/react';

export function createEmptyRuntimePatch() {
  return {
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
    nodeExecutionActiveCounts: {},
    nodeExecutionStartedCounts: {},
    nodeExecutionCompletedCounts: {},
    nodeExecutionExpectedCounts: {},
    nodeErrors: {},
    nodeWarnings: {},
    nodeOutputs: {},
    aiResultOutputs: {},
    executionLogs: [],
    workflowWarningMessage: null,
  } satisfies Pick<
    WorkflowDocument,
    | 'isExecuting'
    | 'executionProgress'
    | 'executionMessage'
    | 'currentRunId'
    | 'executingNodeId'
    | 'lastExecutionStatus'
    | 'lastExecutionTime'
    | 'lastExecutionError'
    | 'lastExecutionSummary'
    | 'nodeExecStatus'
    | 'nodeExecutionTime'
    | 'nodeExecutionStartedAt'
    | 'nodeExecutionActiveCounts'
    | 'nodeExecutionStartedCounts'
    | 'nodeExecutionCompletedCounts'
    | 'nodeExecutionExpectedCounts'
    | 'nodeErrors'
    | 'nodeWarnings'
    | 'nodeOutputs'
    | 'aiResultOutputs'
    | 'executionLogs'
    | 'workflowWarningMessage'
  >;
}

export function createWorkflowDocumentSnapshot(
  state: WorkflowState,
  patch: Partial<WorkflowDocument> = {},
): WorkflowDocument {
  const current = state.documents.find((document) => document.documentId === state.activeDocumentId);
  return {
    documentId: state.activeDocumentId,
    workflowId: state.workflowId,
    sourceWorkflowId: current?.sourceWorkflowId,
    name: state.workflowName,
    nodes: state.nodes,
    edges: state.edges,
    selectedNodeId: state.selectedNodeId,
    hasUnsavedChanges: state.hasUnsavedChanges,
    lastSavedAt: state.lastSavedAt,
    origin: current?.origin || 'new',
    isExecuting: state.isExecuting,
    executionProgress: state.executionProgress,
    executionMessage: state.executionMessage,
    currentRunId: state.currentRunId,
    executingNodeId: state.executingNodeId,
    lastExecutionStatus: state.lastExecutionStatus,
    lastExecutionTime: state.lastExecutionTime,
    lastExecutionError: state.lastExecutionError,
    lastExecutionSummary: state.lastExecutionSummary,
    nodeExecStatus: state.nodeExecStatus,
    nodeExecutionTime: state.nodeExecutionTime,
    nodeExecutionStartedAt: state.nodeExecutionStartedAt,
    nodeExecutionActiveCounts: state.nodeExecutionActiveCounts,
    nodeExecutionStartedCounts: state.nodeExecutionStartedCounts,
    nodeExecutionCompletedCounts: state.nodeExecutionCompletedCounts,
    nodeExecutionExpectedCounts: state.nodeExecutionExpectedCounts,
    nodeErrors: state.nodeErrors,
    nodeWarnings: state.nodeWarnings,
    nodeOutputs: state.nodeOutputs,
    aiResultOutputs: state.aiResultOutputs,
    executionLogs: state.executionLogs,
    workflowWarningMessage: state.workflowWarningMessage,
    ...patch,
  };
}

export function patchActiveWorkflowDocument(state: WorkflowState, patch: Partial<WorkflowDocument> = {}) {
  return state.documents.map((document) =>
    document.documentId === state.activeDocumentId ? createWorkflowDocumentSnapshot(state, patch) : document,
  );
}

export function getDocumentViewPatch(document: WorkflowDocument): Partial<WorkflowState> {
  return {
    activeDocumentId: document.documentId,
    workflowId: document.workflowId,
    workflowName: document.name,
    nodes: document.nodes as Node[],
    edges: document.edges as Edge[],
    selectedNodeId: document.selectedNodeId,
    hasUnsavedChanges: document.hasUnsavedChanges,
    lastSavedAt: document.lastSavedAt,
    isExecuting: document.isExecuting,
    executionProgress: document.executionProgress,
    executionMessage: document.executionMessage,
    currentRunId: document.currentRunId,
    executingNodeId: document.executingNodeId,
    lastExecutionStatus: document.lastExecutionStatus,
    lastExecutionTime: document.lastExecutionTime,
    lastExecutionError: document.lastExecutionError,
    lastExecutionSummary: document.lastExecutionSummary,
    nodeExecStatus: document.nodeExecStatus,
    nodeExecutionTime: document.nodeExecutionTime,
    nodeExecutionStartedAt: document.nodeExecutionStartedAt,
    nodeExecutionActiveCounts: document.nodeExecutionActiveCounts,
    nodeExecutionStartedCounts: document.nodeExecutionStartedCounts,
    nodeExecutionCompletedCounts: document.nodeExecutionCompletedCounts,
    nodeExecutionExpectedCounts: document.nodeExecutionExpectedCounts,
    nodeErrors: document.nodeErrors,
    nodeWarnings: document.nodeWarnings,
    nodeOutputs: document.nodeOutputs,
    aiResultOutputs: document.aiResultOutputs,
    executionLogs: document.executionLogs,
    workflowWarningMessage: document.workflowWarningMessage,
  };
}

export function createEmptyWorkflowDocument(options: {
  documentId?: string;
  workflowId?: string;
  name?: string;
  origin?: WorkflowDocumentOrigin;
  sourceWorkflowId?: string;
  hasUnsavedChanges?: boolean;
} = {}): WorkflowDocument {
  return {
    documentId: options.documentId || gid(),
    workflowId: options.workflowId || gid(),
    sourceWorkflowId: options.sourceWorkflowId,
    name: options.name || DEFAULT_WORKFLOW_NAME,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    hasUnsavedChanges: options.hasUnsavedChanges ?? false,
    lastSavedAt: null,
    origin: options.origin || 'new',
    ...createEmptyRuntimePatch(),
  };
}

export function createWorkflowDocumentTabActions(set: WorkflowStoreSet, get: WorkflowStoreGet) {
  return {
    setActiveWorkflowDocument: (documentId: string) => {
      const state = get();
      if (documentId === state.activeDocumentId) return;
      const target = state.documents.find((document) => document.documentId === documentId);
      if (!target) return;
      set({
        documents: patchActiveWorkflowDocument(state),
        ...getDocumentViewPatch(target),
      });
    },

    createWorkflowDocument: (options?: { origin?: WorkflowDocumentOrigin; name?: string }) => {
      const state = get();
      const document = createEmptyWorkflowDocument({
        origin: options?.origin || 'new',
        name: options?.name || DEFAULT_WORKFLOW_NAME,
      });
      set({
        documents: [...patchActiveWorkflowDocument(state), document],
        ...getDocumentViewPatch(document),
      });
      get().persistLocalDraft();
    },

    closeWorkflowDocument: async (documentId: string, options?: { discardUnsaved?: boolean }) => {
      const state = get();
      const currentDocuments = patchActiveWorkflowDocument(state);
      const target = currentDocuments.find((document) => document.documentId === documentId);
      if (!target) return true;
      if (target.hasUnsavedChanges && !options?.discardUnsaved) return false;

      const remaining = currentDocuments.filter((document) => document.documentId !== documentId);
      if (remaining.length === 0) {
        get().createWorkflowDocument();
        return true;
      }

      const nextDocument =
        documentId === state.activeDocumentId ? remaining[Math.max(0, remaining.length - 1)] : currentDocuments.find((document) => document.documentId === state.activeDocumentId);

      set({
        documents: remaining,
        ...getDocumentViewPatch(nextDocument || remaining[0]),
      });
      get().persistLocalDraft();
      return true;
    },
  };
}
