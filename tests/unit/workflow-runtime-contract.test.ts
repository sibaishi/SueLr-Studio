import {
  createClearedNodeExecutionPatch,
  createClearedRuntimePatch,
  createExecutionStartPatch,
} from '@/domains/workflow/lib/store/runtimeState';
import { describe, expect, it } from 'vitest';

describe('workflow runtime patch contracts', () => {
  it('clears node execution state without clearing retained outputs or logs', () => {
    expect(Object.keys(createClearedNodeExecutionPatch()).sort()).toEqual(
      [
        'nodeErrors',
        'nodeExecStatus',
        'nodeExecutionActiveCounts',
        'nodeExecutionCompletedCounts',
        'nodeExecutionExpectedCounts',
        'nodeExecutionStartedAt',
        'nodeExecutionStartedCounts',
        'nodeExecutionTime',
        'nodeWarnings',
        'workflowWarningMessage',
      ].sort(),
    );
  });

  it('fully clears document runtime state when replacing the editor document', () => {
    expect(createClearedRuntimePatch()).toMatchObject({
      isExecuting: false,
      currentRunId: null,
      lastExecutionStatus: null,
      nodeOutputs: {},
      aiResultOutputs: {},
      executionLogs: [],
    });
  });

  it('starts a run without clearing the retained AI result output cache', () => {
    const patch = createExecutionStartPatch('准备执行工作流...', [
      { id: 'log-1', timestamp: 1, level: 'info', message: 'start' },
    ]);

    expect(patch).toMatchObject({
      isExecuting: true,
      executionMessage: '准备执行工作流...',
      nodeOutputs: {},
      executionLogs: [{ id: 'log-1' }],
      lastExecutionSummary: null,
    });
    expect(patch).not.toHaveProperty('aiResultOutputs');
  });
});
