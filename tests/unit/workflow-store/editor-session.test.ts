import { describe, expect, it } from 'vitest';
import { createWorkflowEditorSessionActions } from '@/domains/workflow/lib/store/editorSession';
import { createWorkflowStoreHarness } from './testHarness';

describe('workflow store editor session actions', () => {
  it('normalizes group facade ports when applying an editor snapshot', () => {
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_before',
      workflowName: 'Before',
      nodes: [{ id: 'stale', type: 'io', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      nodeExecStatus: { stale: 'running' },
      executionLogs: [{ id: 'log_stale', timestamp: 1, level: 'info', message: 'stale' }],
      workflowWarningMessage: 'stale warning',
    });

    const actions = createWorkflowEditorSessionActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.applyEditorSnapshot({
      workflowId: 'wf_snapshot',
      workflowName: 'Snapshot',
      selectedNodeId: 'group',
      nodes: [
        { id: 'outside', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'group', type: 'group', position: { x: 196, y: 0 }, data: {} },
        { id: 'inner', type: 'aiV3', position: { x: 56, y: 84 }, parentId: 'group', extent: 'parent', data: {} },
      ],
      edges: [
        { id: 'edge_in', source: 'outside', sourceHandle: 'result', target: 'inner', targetHandle: 'input' },
        { id: 'edge_out', source: 'inner', sourceHandle: 'result', target: 'outside', targetHandle: 'input' },
      ],
    });

    const state = harness.getState();
    const groupData = (state.nodes.find((node) => node.id === 'group')?.data || {}) as {
      groupInputs?: unknown[];
      groupOutputs?: unknown[];
    };

    expect(state.workflowId).toBe('wf_snapshot');
    expect(state.workflowName).toBe('Snapshot');
    expect(state.edges).toHaveLength(2);
    expect(groupData.groupInputs?.[0]).toMatchObject({
      type: 'any',
      insideLinks: [{ nodeId: 'inner', handleId: 'input' }],
      outsideLinks: [{ nodeId: 'outside', handleId: 'result' }],
    });
    expect(groupData.groupOutputs?.[0]).toMatchObject({
      type: 'any',
      insideLinks: [{ nodeId: 'inner', handleId: 'result' }],
      outsideLinks: [{ nodeId: 'outside', handleId: 'input' }],
    });
    expect(state.nodeExecStatus).toEqual({});
    expect(state.executionLogs).toEqual([]);
    expect(state.workflowWarningMessage).toBeNull();
  });
});
