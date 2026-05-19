import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
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

  it('executes grouped transit ports as direct inner-to-outer connections', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'outer_prompt',
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { text: 'hello group' },
        },
        {
          id: 'group',
          type: 'group',
          position: { x: 240, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: '输入 1',
                type: 'string',
                binding: { nodeId: 'inner_ai', handleId: 'prompt' },
              },
              {
                id: 'port_in_empty',
                label: '输入 2',
                type: null,
                binding: null,
              },
            ],
            groupOutputs: [
              {
                id: 'port_out',
                label: '输出 1',
                type: 'string',
                binding: { nodeId: 'inner_ai', handleId: 'response' },
              },
              {
                id: 'port_out_empty',
                label: '输出 2',
                type: null,
                binding: null,
              },
            ],
          },
        },
        {
          id: 'inner_ai',
          type: 'aiChat',
          position: { x: 48, y: 96 },
          parentId: 'group',
          extent: 'parent',
          data: { disabled: false },
        },
        {
          id: 'outer_output',
          type: 'output',
          position: { x: 720, y: 0 },
          data: { disabled: false },
        },
      ],
      edges: [
        {
          id: 'edge_ext_in',
          source: 'outer_prompt',
          sourceHandle: 'text',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'edge_bind_in',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'inner_ai',
          targetHandle: 'prompt',
        },
        {
          id: 'edge_bind_out',
          source: 'inner_ai',
          sourceHandle: 'response',
          target: 'group',
          targetHandle: 'group-port:output:internal:port_out',
        },
        {
          id: 'edge_ext_out',
          source: 'group',
          sourceHandle: 'group-port:output:external:port_out',
          target: 'outer_output',
          targetHandle: 'content',
        },
      ],
      saveWorkflow: vi.fn(async () => true),
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    expect(api.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(api.executeWorkflow).toHaveBeenCalledWith(
      'wf_local',
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'outer_prompt', type: 'textInput' }),
          expect.objectContaining({ id: 'inner_ai', type: 'aiChat' }),
          expect.objectContaining({ id: 'outer_output', type: 'output' }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({
            source: 'outer_prompt',
            sourceHandle: 'text',
            target: 'inner_ai',
            targetHandle: 'prompt',
          }),
          expect.objectContaining({
            source: 'inner_ai',
            sourceHandle: 'response',
            target: 'outer_output',
            targetHandle: 'content',
          }),
        ]),
      }),
      expect.any(Object),
    );

    const [, payload] = vi.mocked(api.executeWorkflow).mock.calls[0] || [];
    const payloadNodes = (payload?.nodes || []) as Node[];
    const payloadEdges = (payload?.edges || []) as Edge[];
    expect(payloadNodes).toHaveLength(3);
    expect(payloadNodes.find((node) => node.id === 'group')).toBeUndefined();
    expect(payloadEdges).toHaveLength(2);
    expect(payloadEdges.some((edge) => edge.source === 'group' || edge.target === 'group')).toBe(false);
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

  it('accepts textInput as a valid terminal node for AI output validation', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'prompt',
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { text: 'hello' },
        },
        {
          id: 'ai_node',
          type: 'aiChat',
          position: { x: 200, y: 0 },
          data: { disabled: false },
        },
        {
          id: 'editable_text',
          type: 'textInput',
          position: { x: 400, y: 0 },
          data: { text: 'local fallback' },
        },
      ],
      edges: [
        { id: 'edge-prompt-ai', source: 'prompt', sourceHandle: 'text', target: 'ai_node', targetHandle: 'prompt' },
        { id: 'edge-ai-text', source: 'ai_node', sourceHandle: 'response', target: 'editable_text', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    expect(api.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(harness.getState().workflowWarningMessage).toBeNull();
  });

  it('executes only the upstream graph when running to a target node', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'a', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'a' } },
        { id: 'b', type: 'textMerge', position: { x: 200, y: 0 }, data: {} },
        { id: 'c', type: 'textInput', position: { x: 400, y: 0 }, data: {} },
        { id: 'd', type: 'output', position: { x: 600, y: 0 }, data: {} },
        { id: 'side', type: 'output', position: { x: 400, y: 160 }, data: {} },
        { id: 'other', type: 'textInput', position: { x: 0, y: 160 }, data: { text: 'other' } },
      ],
      edges: [
        { id: 'ab', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'text1' },
        { id: 'bc', source: 'b', sourceHandle: 'text', target: 'c', targetHandle: 'input' },
        { id: 'cd', source: 'c', sourceHandle: 'text', target: 'd', targetHandle: 'content' },
        { id: 'b-side', source: 'b', sourceHandle: 'text', target: 'side', targetHandle: 'content' },
      ],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflowToNode('c');

    expect(api.executeWorkflow).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(api.executeWorkflow).mock.calls[0] || [];
    const payloadNodes = (payload?.nodes || []) as Node[];
    const payloadEdges = (payload?.edges || []) as Edge[];
    expect(payloadNodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(payloadEdges.map((edge) => edge.id)).toEqual(['ab', 'bc']);
  });

  it('running to a non-output node skips full AI terminal validation', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'prompt', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello' } },
        { id: 'ai_node', type: 'aiChat', position: { x: 200, y: 0 }, data: { disabled: false } },
        { id: 'clean_node', type: 'textClean', position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'prompt-ai', source: 'prompt', sourceHandle: 'text', target: 'ai_node', targetHandle: 'prompt' },
        { id: 'ai-clean', source: 'ai_node', sourceHandle: 'response', target: 'clean_node', targetHandle: 'text' },
      ],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflowToNode('clean_node');

    expect(api.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(harness.getState().workflowWarningMessage).toBeNull();
  });

  it('does not run to an AI capability node', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'prompt', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello' } },
        { id: 'ai_node', type: 'aiChat', position: { x: 200, y: 0 }, data: { disabled: false } },
      ],
      edges: [
        { id: 'prompt-ai', source: 'prompt', sourceHandle: 'text', target: 'ai_node', targetHandle: 'prompt' },
      ],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflowToNode('ai_node');

    expect(api.executeWorkflow).not.toHaveBeenCalled();
    expect(harness.getState().workflowWarningMessage).toBe('无法运行到该节点：目标节点不存在或不可执行');
  });

  it('does not run to a source-only node without inputs', async () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'source', type: 'apiKeyInput', position: { x: 0, y: 0 }, data: { apiKey: 'secret' } },
      ],
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflowToNode('source');

    expect(api.executeWorkflow).not.toHaveBeenCalled();
    expect(harness.getState().workflowWarningMessage).toBe('无法运行到该节点：目标节点不存在或不可执行');
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

  it('executes draft workflows without saving first', async () => {
    const addExecutionLog = vi.fn();
    const saveWorkflow = vi.fn(async () => false);
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'text_node',
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { text: 'hello' },
        },
        {
          id: 'output_node',
          type: 'output',
          position: { x: 320, y: 0 },
          data: { disabled: false },
        },
      ],
      edges: [{ id: 'edge-1', source: 'text_node', sourceHandle: 'text', target: 'output_node', targetHandle: 'content' }],
      saveWorkflow,
      addExecutionLog,
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    expect(saveWorkflow).not.toHaveBeenCalled();
    expect(api.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(api.executeWorkflow).toHaveBeenCalledWith(
      'wf_local',
      expect.objectContaining({
        name: 'Test Workflow',
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'text_node', type: 'textInput' }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('writes upstream textInput execution output back into node text', async () => {
    vi.mocked(api.executeWorkflow).mockImplementation(async (_workflowId, _draft, callbacks) => {
      callbacks.onNodeComplete?.({
        nodeId: 'editable_text',
        outputs: { text: 'from upstream' },
        duration: 1,
      });
      callbacks.onWorkflowComplete?.({
        totalDuration: 1,
        successCount: 1,
        failCount: 0,
      });
    });

    const harness = createWorkflowStoreHarness({
      hasUnsavedChanges: false,
      nodes: [
        {
          id: 'source_text',
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { text: 'from upstream' },
        },
        {
          id: 'editable_text',
          type: 'textInput',
          position: { x: 300, y: 0 },
          data: { text: 'local fallback' },
        },
      ],
      edges: [{ id: 'edge-1', source: 'source_text', sourceHandle: 'text', target: 'editable_text', targetHandle: 'input' }],
      saveWorkflow: vi.fn(async () => false),
      addExecutionLog: vi.fn(),
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    const state = harness.getState();
    expect(state.nodes.find((node) => node.id === 'editable_text')?.data.text).toBe('from upstream');
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('writes upstream textSplit execution outputs back into node segments', async () => {
    vi.mocked(api.executeWorkflow).mockImplementation(async (_workflowId, _draft, callbacks) => {
      callbacks.onNodeComplete?.({
        nodeId: 'split_node',
        outputs: { part1: 'first', part2: 'second' },
        duration: 1,
      });
      callbacks.onWorkflowComplete?.({
        totalDuration: 1,
        successCount: 1,
        failCount: 0,
      });
    });

    const harness = createWorkflowStoreHarness({
      hasUnsavedChanges: false,
      nodes: [
        {
          id: 'source_text',
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { text: 'first\n---\nsecond' },
        },
        {
          id: 'split_node',
          type: 'textSplit',
          position: { x: 300, y: 0 },
          data: { outputCount: 2, segments: ['local first', 'local second'] },
        },
      ],
      edges: [{ id: 'edge-1', source: 'source_text', sourceHandle: 'text', target: 'split_node', targetHandle: 'text' }],
      saveWorkflow: vi.fn(async () => false),
      addExecutionLog: vi.fn(),
    });

    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.executeWorkflow();

    const state = harness.getState();
    expect(state.nodes.find((node) => node.id === 'split_node')?.data.segments).toEqual(['first', 'second']);
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('keeps a repeated node running until all concurrent iteration completions settle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    try {
      const harness = createWorkflowStoreHarness({
        nodes: [
          {
            id: 'repeated_node',
            type: 'textClean',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        addExecutionLog: vi.fn(),
      });
      const actions = createWorkflowExecutionActions(harness.set, harness.get);
      harness.attachActions(actions);

      vi.mocked(api.executeWorkflow).mockImplementation(async (_workflowId, _draft, callbacks) => {
        callbacks.onNodeStart?.({
          nodeId: 'repeated_node',
          nodeType: 'textClean',
          index: 0,
          total: 1,
          iteration: { sourceNodeId: 'iter_node', index: 1, total: 2 },
        });
        vi.setSystemTime(1200);
        callbacks.onNodeStart?.({
          nodeId: 'repeated_node',
          nodeType: 'textClean',
          index: 0,
          total: 1,
          iteration: { sourceNodeId: 'iter_node', index: 2, total: 2 },
        });
        vi.setSystemTime(1500);
        callbacks.onNodeComplete?.({
          nodeId: 'repeated_node',
          outputs: { text: 'first' },
          duration: 500,
          iteration: { sourceNodeId: 'iter_node', index: 1, total: 2 },
        });

        const midState = harness.getState();
        expect(midState.nodeExecStatus.repeated_node).toBe('running');
        expect(midState.nodeExecutionTime.repeated_node).toBe(0);
        expect(midState.nodeExecutionActiveCounts.repeated_node).toBe(1);

        vi.setSystemTime(1900);
        callbacks.onNodeComplete?.({
          nodeId: 'repeated_node',
          outputs: { text: 'second' },
          duration: 700,
          iteration: { sourceNodeId: 'iter_node', index: 2, total: 2 },
        });
        callbacks.onWorkflowComplete?.({
          totalDuration: 900,
          successCount: 2,
          failCount: 0,
        });
      });

      await actions.executeWorkflow();

      const state = harness.getState();
      expect(state.nodeExecStatus.repeated_node).toBe('success');
      expect(state.nodeExecutionTime.repeated_node).toBe(900);
      expect(state.nodeExecutionActiveCounts.repeated_node).toBe(0);
      expect(state.nodeOutputs.repeated_node).toEqual({ text: ['first', 'second'] });
    } finally {
      vi.useRealTimers();
    }
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
    expect(addExecutionLog).toHaveBeenCalledTimes(2);
    expect(addExecutionLog).toHaveBeenLastCalledWith(expect.objectContaining({
      level: 'error',
      message: '工作流执行失败',
    }));
  });

  it('finalizes lingering running nodes when sync reports completion', async () => {
    vi.mocked(api.fetchExecutionStatus).mockResolvedValue({
      success: true,
      data: {
        runId: 'run_completed_sync',
        status: 'completed',
        totalDuration: 1800,
        successCount: 2,
        failCount: 0,
      },
    } as Awaited<ReturnType<typeof api.fetchExecutionStatus>>);

    const startedAt = Date.now() - 1500;
    const harness = createWorkflowStoreHarness({
      currentRunId: 'run_completed_sync',
      isExecuting: true,
      nodeExecStatus: { node_a: 'running' },
      nodeExecutionStartedAt: { node_a: startedAt },
      nodeExecutionTime: { node_a: 0 },
      addExecutionLog: vi.fn(),
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(state.nodeExecStatus.node_a).toBe('success');
    expect(state.nodeExecutionTime.node_a).toBeGreaterThanOrEqual(1000);
    expect(state.nodeErrors.node_a).toBeUndefined();
  });

  it('attaches fallback error details to lingering running nodes when sync reports failure', async () => {
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
      nodeExecStatus: { node_b: 'running' },
      nodeExecutionStartedAt: { node_b: Date.now() - 600 },
      nodeExecutionTime: { node_b: 0 },
      addExecutionLog,
    });
    const actions = createWorkflowExecutionActions(harness.set, harness.get);
    harness.attachActions(actions);

    await actions.syncExecutionRunStatus();

    const state = harness.getState();
    expect(state.nodeExecStatus.node_b).toBe('error');
    expect(state.nodeErrors.node_b).toBe('upstream timeout');
    expect(state.nodeExecutionTime.node_b).toBeGreaterThanOrEqual(500);
    expect(addExecutionLog).toHaveBeenCalledTimes(2);
    expect(addExecutionLog).toHaveBeenLastCalledWith(expect.objectContaining({
      level: 'error',
      message: '工作流执行失败',
    }));
  });

});
