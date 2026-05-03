import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowExecutionActions } from '@/features/workflow/lib/store/execution';
import { createWorkflowStoreHarness } from './testHarness';

vi.mock('@/features/workflow/lib/api', () => ({
  executeWorkflow: vi.fn(),
  cancelExecution: vi.fn(),
  fetchExecutionStatus: vi.fn(),
}));

vi.mock('@/features/workflow/lib/store/persistence', () => ({
  clearActiveRunSnapshot: vi.fn(),
  loadActiveRunSnapshot: vi.fn(() => null),
  saveActiveRunSnapshot: vi.fn(),
}));

import * as api from '@/features/workflow/lib/api';
import {
  clearActiveRunSnapshot,
  loadActiveRunSnapshot,
} from '@/features/workflow/lib/store/persistence';

describe('workflow store execution actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks execution when an active AI node has no valid output chain', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'ai_node',
          type: 'aiChat',
          position: { x: 0, y: 0 },
          data: { disabled: false },
        },
      ],
      edges: [],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    const state = harness.getState();
    expect(api.executeWorkflow).not.toHaveBeenCalled();
    expect(state.isExecuting).toBe(false);
    expect(state.lastExecutionStatus).toBe('error');
    expect(state.lastExecutionError).toBeTruthy();
    expect(state.nodeWarnings.ai_node).toBeTruthy();
    expect(state.workflowWarningMessage).toBeTruthy();
  });

  it('clears a stale active run snapshot when the upstream run is no longer running', async () => {
    vi.mocked(loadActiveRunSnapshot).mockReturnValue({
      runId: 'run_stale',
      workflowId: 'wf_remote',
    });
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: true,
      data: {
        runId: 'run_stale',
        status: 'completed',
      },
    });

    const harness = createWorkflowStoreHarness();
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.restoreExecutionRun();

    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.getState().isExecuting).toBe(false);
  });

  it('restores a running execution and reloads the matching workflow when needed', async () => {
    vi.mocked(loadActiveRunSnapshot).mockReturnValue({
      runId: 'run_live',
      workflowId: 'wf_remote',
      source: 'draft',
      snapshotVersion: 7,
    });
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: true,
      data: {
        runId: 'run_live',
        workflowId: 'wf_remote',
        status: 'running',
        source: 'draft',
        snapshotVersion: 7,
      },
    });

    const loadWorkflow = vi.fn(async (workflowId: string) => {
      harness.setState({ workflowId });
      return true;
    });
    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_local',
      loadWorkflow,
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.restoreExecutionRun();

    const state = harness.getState();
    expect(loadWorkflow).toHaveBeenCalledWith('wf_remote');
    expect(state.isExecuting).toBe(true);
    expect(state.currentRunId).toBe('run_live');
    expect(state.lastExecutionStatus).toBeNull();
    expect(addExecutionLog).toHaveBeenCalledTimes(1);
  });

  it('reconnects to a still-running execution status and settles completed runs', async () => {
    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      currentRunId: 'run_sync',
      isExecuting: false,
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    vi.mocked(api.fetchExecutionStatus).mockResolvedValueOnce({
      success: true,
      data: {
        runId: 'run_sync',
        status: 'running',
      },
    });

    await actions.syncExecutionRunStatus();

    expect(harness.getState().isExecuting).toBe(true);
    expect(harness.getState().executionMessage).toBeTruthy();

    vi.mocked(api.fetchExecutionStatus).mockResolvedValueOnce({
      success: true,
      data: {
        runId: 'run_sync',
        status: 'completed',
      },
    });

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.executingNodeId).toBeNull();
    expect(addExecutionLog).toHaveBeenCalledTimes(1);
  });
});
