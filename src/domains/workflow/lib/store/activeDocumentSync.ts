import type { WorkflowState } from '@/domains/workflow/lib/store/types';

export function syncActiveDocument(state: WorkflowState): WorkflowState {
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

