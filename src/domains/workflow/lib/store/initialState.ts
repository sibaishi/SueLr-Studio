import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { createEmptyRuntimePatch } from '@/domains/workflow/lib/store/documents';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { gid, normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { loadLocalDraft } from '@/domains/workflow/lib/store/persistence';
import type { WorkflowDocument, WorkflowState } from '@/domains/workflow/lib/store/types';
import type { ProjectModel } from '@/domains/workflow/lib/projectModels';
import type { Edge, Node } from '@xyflow/react';

export const initialDraft = loadLocalDraft();

type WorkflowStoreDataState = {
  documents: WorkflowDocument[];
  activeDocumentId: string;
  workflowId: string;
  workflowName: string;
  workflowList: WorkflowState['workflowList'];
  isHydratingWorkflow: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionProgress: WorkflowState['executionProgress'];
  executionMessage: string | null;
  currentRunId: string | null;
  executingNodeId: string | null;
  lastExecutionStatus: WorkflowState['lastExecutionStatus'];
  lastExecutionTime: number | null;
  lastExecutionError: string | null;
  lastExecutionSummary: WorkflowState['lastExecutionSummary'];
  nodeExecStatus: WorkflowState['nodeExecStatus'];
  nodeExecutionTime: WorkflowState['nodeExecutionTime'];
  nodeExecutionStartedAt: WorkflowState['nodeExecutionStartedAt'];
  nodeExecutionActiveCounts: WorkflowState['nodeExecutionActiveCounts'];
  nodeExecutionStartedCounts: WorkflowState['nodeExecutionStartedCounts'];
  nodeExecutionCompletedCounts: WorkflowState['nodeExecutionCompletedCounts'];
  nodeExecutionExpectedCounts: WorkflowState['nodeExecutionExpectedCounts'];
  nodeErrors: WorkflowState['nodeErrors'];
  nodeWarnings: WorkflowState['nodeWarnings'];
  nodeOutputs: WorkflowState['nodeOutputs'];
  aiResultOutputs: WorkflowState['aiResultOutputs'];
  executionLogs: WorkflowState['executionLogs'];
  workflowWarningMessage: string | null;
  availableModels: WorkflowState['availableModels'];
  workflowRuntimeConfigs: WorkflowState['workflowRuntimeConfigs'];
  projectModels: ProjectModel[];
  showDebugSizes: boolean;
  snapToGridEnabled: boolean;
};

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

export function createInitialWorkflowState(): WorkflowStoreDataState {
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
        origin: 'new',
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
  };
}

export function createResetWorkflowState(): Partial<WorkflowState> {
  return {
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
  };
}
