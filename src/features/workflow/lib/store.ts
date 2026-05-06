// ============================================================
// Flow Studio - Workflow Store
// ============================================================

import { create } from 'zustand';
import { DEFAULT_WORKFLOW_NAME } from '@/features/workflow/lib/constants';
import { loadLocalDraft } from '@/features/workflow/lib/store/persistence';
import type { WorkflowState } from '@/features/workflow/lib/store/types';
import { createWorkflowDocumentActions } from '@/features/workflow/lib/store/document';
import { createWorkflowExecutionActions } from '@/features/workflow/lib/store/execution';
import { createWorkflowEditorActions } from '@/features/workflow/lib/store/editor';
import { normalizeEditorNodes } from '@/features/workflow/lib/store/editorShared';
import { gid } from '@/features/workflow/lib/store/helpers';
import { normalizeEdges, normalizeNodes } from '@/features/workflow/lib/store/helpers';

export type {
  ActiveRunSnapshot,
  ExecutionLogEntry,
  NodeExecStatus,
  WorkflowDraftSnapshot,
  WorkflowEditorSnapshot,
  WorkflowImportResult,
  WorkflowState,
} from '@/features/workflow/lib/store/types';

const initialDraft = loadLocalDraft();
const initialDraftNodes = initialDraft ? normalizeNodes(initialDraft.nodes) : [];
const initialDraftEdges = initialDraft
  ? normalizeEdges(initialDraft.edges, new Set(initialDraftNodes.map((node) => node.id)))
  : [];
const normalizedInitialDraftNodes = normalizeEditorNodes(initialDraftNodes, initialDraftEdges);

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: initialDraft?.workflowId || gid(),
  workflowName: initialDraft?.workflowName || DEFAULT_WORKFLOW_NAME,
  workflowList: [],
  isHydratingWorkflow: false,
  isSavingWorkflow: false,
  hasUnsavedChanges: false,
  lastSavedAt: null,
  nodes: normalizedInitialDraftNodes,
  edges: initialDraftEdges,
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

  ...createWorkflowEditorActions(set, get),
  ...createWorkflowExecutionActions(set, get),
  ...createWorkflowDocumentActions(set, get, { initialDraft }),
}));

