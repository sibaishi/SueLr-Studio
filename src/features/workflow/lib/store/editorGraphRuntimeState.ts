import type { WorkflowState } from '@/features/workflow/lib/store/types';

type WorkflowRuntimeState = Pick<
  WorkflowState,
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
>;

export function clearRemovedNodeRuntimeState(
  state: WorkflowRuntimeState,
  removedIds: Iterable<string>,
) {
  const nodeExecStatus = { ...state.nodeExecStatus };
  const nodeExecutionTime = { ...state.nodeExecutionTime };
  const nodeExecutionStartedAt = { ...state.nodeExecutionStartedAt };
  const nodeExecutionActiveCounts = { ...state.nodeExecutionActiveCounts };
  const nodeExecutionStartedCounts = { ...state.nodeExecutionStartedCounts };
  const nodeExecutionCompletedCounts = { ...state.nodeExecutionCompletedCounts };
  const nodeExecutionExpectedCounts = { ...state.nodeExecutionExpectedCounts };
  const nodeErrors = { ...state.nodeErrors };
  const nodeWarnings = { ...state.nodeWarnings };
  const nodeOutputs = { ...state.nodeOutputs };

  for (const id of removedIds) {
    delete nodeExecStatus[id];
    delete nodeExecutionTime[id];
    delete nodeExecutionStartedAt[id];
    delete nodeExecutionActiveCounts[id];
    delete nodeExecutionStartedCounts[id];
    delete nodeExecutionCompletedCounts[id];
    delete nodeExecutionExpectedCounts[id];
    delete nodeErrors[id];
    delete nodeWarnings[id];
    delete nodeOutputs[id];
  }

  return {
    nodeExecStatus,
    nodeExecutionTime,
    nodeExecutionStartedAt,
    nodeExecutionActiveCounts,
    nodeExecutionStartedCounts,
    nodeExecutionCompletedCounts,
    nodeExecutionExpectedCounts,
    nodeErrors,
    nodeWarnings,
    nodeOutputs,
  };
}
