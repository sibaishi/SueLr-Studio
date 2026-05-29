// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { createWorkflowDocumentActions } from '@/domains/workflow/lib/store/document';
import { createEmptyRuntimePatch, createWorkflowDocumentTabActions } from '@/domains/workflow/lib/store/documents';
import { createWorkflowEditorActions } from '@/domains/workflow/lib/store/editor';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { createWorkflowExecutionActions } from '@/domains/workflow/lib/store/execution';
import { gid } from '@/domains/workflow/lib/store/helpers';
import { normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { loadLocalDraft } from '@/domains/workflow/lib/store/persistence';
import type { WorkflowState } from '@/domains/workflow/lib/store/types';
import { create } from 'zustand';

export type {
  ActiveRunSnapshot,
  ExecutionLogEntry,
  NodeExecStatus,
  WorkflowDraftSnapshot,
  WorkflowDocument,
  WorkflowEditorSnapshot,
  WorkflowImportResult,
  WorkflowState,
} from '@/domains/workflow/lib/store/types';

const initialDraft = loadLocalDraft();
const initialDraftNodes = initialDraft ? normalizeNodes(initialDraft.nodes) : [];
const initialDraftEdges = initialDraft
  ? normalizeEdges(initialDraft.edges, new Set(initialDraftNodes.map((node) => node.id)))
  : [];
const normalizedInitialDraftNodes = normalizeEditorNodes(initialDraftNodes, initialDraftEdges);
const prunedInitialDraftEdges = pruneGroupPortEdges(normalizedInitialDraftNodes, initialDraftEdges);
const finalInitialDraftNodes = normalizeEditorNodes(initialDraftNodes, prunedInitialDraftEdges);
const initialDocumentId = gid();
const initialWorkflowId = initialDraft?.workflowId || gid();
const initialWorkflowName = initialDraft?.workflowName || DEFAULT_WORKFLOW_NAME;

function syncActiveDocument(state: WorkflowState): WorkflowState {
  if (!state.activeDocumentId) return state;
  const documents = state.documents.map((document) =>
    document.documentId === state.activeDocumentId
      ? {
          ...document,
          workflowId: state.workflowId,
          name: state.workflowName,
          nodes: state.nodes,
          edges: state.edges,
          selectedNodeId: state.selectedNodeId,
          hasUnsavedChanges: state.hasUnsavedChanges,
          lastSavedAt: state.lastSavedAt,
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
        }
      : document,
  );
  return documents === state.documents ? state : { ...state, documents };
}

export const useWorkflowStore = create<WorkflowState>((baseSet, get) => {
  const set: typeof baseSet = (partial) => {
    baseSet((state) => {
      const patch = typeof partial === 'function' ? partial(state) : partial;
      const nextState = { ...state, ...patch };
      return 'documents' in patch ? nextState : syncActiveDocument(nextState);
    });
  };

  return {
  documents: [
    {
      documentId: initialDocumentId,
      workflowId: initialWorkflowId,
      sourceWorkflowId: initialDraft ? initialDraft.workflowId : undefined,
      name: initialWorkflowName,
      nodes: finalInitialDraftNodes,
      edges: prunedInitialDraftEdges,
      selectedNodeId: null,
      hasUnsavedChanges: Boolean(initialDraft),
      lastSavedAt: null,
      origin: initialDraft ? 'new' : 'new',
      ...createEmptyRuntimePatch(),
    },
  ],
  activeDocumentId: initialDocumentId,
  workflowId: initialWorkflowId,
  workflowName: initialWorkflowName,
  workflowList: [],
  isHydratingWorkflow: false,
  isSavingWorkflow: false,
  hasUnsavedChanges: false,
  lastSavedAt: null,
  nodes: finalInitialDraftNodes,
  edges: prunedInitialDraftEdges,
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
  availableModels: { all: [], chat: [], image: [], video: [] },
  workflowRuntimeConfigs: [],
  projectModels: [],
  showDebugSizes: false,
  snapToGridEnabled: false,
  resetUserWorkspace: () => {
    set({
      workflowId: gid(),
      workflowName: DEFAULT_WORKFLOW_NAME,
      workflowList: [],
      isHydratingWorkflow: false,
      isSavingWorkflow: false,
      hasUnsavedChanges: false,
      lastSavedAt: null,
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
      availableModels: { all: [], chat: [], image: [], video: [] },
      workflowRuntimeConfigs: [],
      projectModels: [],
      documents: [],
      activeDocumentId: '',
    });
  },

  ...createWorkflowEditorActions(set, get),
  ...createWorkflowDocumentTabActions(set, get),
  ...createWorkflowExecutionActions(set, get),
  ...createWorkflowDocumentActions(set, get, { initialDraft }),
};
});
