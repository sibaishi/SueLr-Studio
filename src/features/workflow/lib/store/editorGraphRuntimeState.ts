import type { WorkflowState } from '@/features/workflow/lib/store/types';

type WorkflowRuntimeState = Pick<
  WorkflowState,
  | 'nodeExecStatus'
  | 'nodeExecutionTime'
  | 'nodeExecutionStartedAt'
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

  return {
    nodeExecStatus,
    nodeExecutionTime,
    nodeExecutionStartedAt,
    nodeErrors,
    nodeWarnings,
    nodeOutputs,
  };
}
