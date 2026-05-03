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

  it('stops execution cleanly when workflow save fails before launch', async () => {
    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'ai_node',
          type: 'aiChat',
          position: { x: 0, y: 0 },
          data: { disabled: false },
        },
        {
          id: 'output_node',
          type: 'output',
          position: { x: 320, y: 0 },
          data: { disabled: false },
        },
      ],
      edges: [{ id: 'edge-1', source: 'ai_node', target: 'output_node' }],
      saveWorkflow: vi.fn(async () => false),
      addExecutionLog,
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    const state = harness.getState();
    expect(api.executeWorkflow).not.toHaveBeenCalled();
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.lastExecutionStatus).toBe('error');
    expect(state.lastExecutionError).toBe('工作流保存失败，未启动执行');
    expect(addExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      message: '工作流保存失败，已取消执行',
    }));
  });

  it('marks execution stopped when cancel is requested without a run id', async () => {
    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      isExecuting: true,
      currentRunId: null,
      executionMessage: '正在执行工作流...',
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.cancelWorkflowExecution();

    const state = harness.getState();
    expect(api.cancelExecution).not.toHaveBeenCalled();
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.isExecuting).toBe(false);
    expect(state.executionMessage).toBe('工作流执行已停止');
    expect(state.lastExecutionStatus).toBe('error');
    expect(state.lastExecutionError).toBe('没有可取消的运行 ID');
    expect(addExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      message: '用户请求停止工作流',
    }));
  });

  it('keeps local execution state untouched when sync status fetch fails', async () => {
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: false,
      error: 'network failed',
    } as Awaited<ReturnType<typeof api.fetchExecutionStatus>>);

    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      currentRunId: 'run_sync_failed',
      isExecuting: true,
      executionMessage: '正在执行：节点 A',
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(clearActiveRunSnapshot).not.toHaveBeenCalled();
    expect(state.isExecuting).toBe(true);
    expect(state.currentRunId).toBe('run_sync_failed');
    expect(state.executionMessage).toBe('正在执行：节点 A');
    expect(addExecutionLog).not.toHaveBeenCalled();
  });

  it('settles synced completed runs into final success state', async () => {
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: true,
      data: {
        runId: 'run_completed_sync',
        status: 'completed',
        totalDuration: 1800,
        successCount: 3,
        failCount: 0,
      },
    } as Awaited<ReturnType<typeof api.fetchExecutionStatus>>);

    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      currentRunId: 'run_completed_sync',
      isExecuting: true,
      executionMessage: 'running...',
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.executingNodeId).toBeNull();
    expect(state.lastExecutionStatus).toBe('success');
    expect(state.lastExecutionTime).toBe(1800);
    expect(state.lastExecutionError).toBeNull();
    expect(state.lastExecutionSummary).toEqual({
      totalDuration: 1800,
      successCount: 3,
      failCount: 0,
    });
    expect(addExecutionLog).toHaveBeenCalledTimes(1);
  });

  it('settles synced failed runs into final error state', async () => {
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: true,
      data: {
        runId: 'run_failed_sync',
        status: 'failed',
        error: 'upstream timeout',
      },
    } as Awaited<ReturnType<typeof api.fetchExecutionStatus>>);

    const addExecutionLog = vi.fn();
    const harness = createWorkflowStoreHarness({
      currentRunId: 'run_failed_sync',
      isExecuting: true,
      executionMessage: 'running...',
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.lastExecutionStatus).toBe('error');
    expect(state.lastExecutionError).toBe('upstream timeout');
    expect(state.lastExecutionSummary).toBeNull();
    expect(addExecutionLog).toHaveBeenCalledTimes(1);
  });

});
