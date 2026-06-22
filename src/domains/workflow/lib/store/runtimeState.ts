import type { ExecutionLogEntry, WorkflowDocument } from '@/domains/workflow/lib/store/types';

type NodeExecutionRuntimePatch = Pick<
  WorkflowDocument,
  | 'nodeExecStatus'
  | 'nodeExecutionTime'
  | 'nodeExecutionStartedAt'
  | 'nodeExecutionActiveCounts'
  | 'nodeExecutionStartedCounts'
  | 'nodeExecutionCompletedCounts'
  | 'nodeExecutionExpectedCounts'
  | 'nodeErrors'
  | 'nodeWarnings'
  | 'workflowWarningMessage'
>;

export function createClearedNodeExecutionPatch(): NodeExecutionRuntimePatch {
  return {
    nodeExecStatus: {},
    nodeExecutionTime: {},
    nodeExecutionStartedAt: {},
    nodeExecutionActiveCounts: {},
    nodeExecutionStartedCounts: {},
    nodeExecutionCompletedCounts: {},
    nodeExecutionExpectedCounts: {},
    nodeErrors: {},
    nodeWarnings: {},
    workflowWarningMessage: null,
  };
}

export function createClearedRuntimePatch() {
  return {
    isExecuting: false,
    executionProgress: null,
    executionMessage: null,
    currentRunId: null,
    lastExecutionRunId: null,
    executingNodeId: null,
    lastExecutionStatus: null,
    lastExecutionTime: null,
    lastExecutionError: null,
    lastExecutionSummary: null,
    ...createClearedNodeExecutionPatch(),
    nodeOutputs: {},
    aiResultOutputs: {},
    executionLogs: [],
  } satisfies Pick<
    WorkflowDocument,
    | 'isExecuting'
    | 'executionProgress'
    | 'executionMessage'
    | 'currentRunId'
    | 'lastExecutionRunId'
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

export function createExecutionStartPatch(executionMessage: string, executionLogs: ExecutionLogEntry[]) {
  return {
    executionProgress: null,
    isExecuting: true,
    executionMessage,
    currentRunId: null,
    lastExecutionRunId: null,
    executingNodeId: null,
    ...createClearedNodeExecutionPatch(),
    nodeOutputs: {},
    executionLogs,
    lastExecutionStatus: null,
    lastExecutionTime: null,
    lastExecutionError: null,
    lastExecutionSummary: null,
  } satisfies Partial<WorkflowDocument>;
}
