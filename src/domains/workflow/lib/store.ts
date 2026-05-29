// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { createWorkflowDocumentActions } from '@/domains/workflow/lib/store/document';
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

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: initialDraft?.workflowId || gid(),
  workflowName: initialDraft?.workflowName || DEFAULT_WORKFLOW_NAME,
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
    });
  },

  ...createWorkflowEditorActions(set, get),
  ...createWorkflowExecutionActions(set, get),
  ...createWorkflowDocumentActions(set, get, { initialDraft }),
}));
