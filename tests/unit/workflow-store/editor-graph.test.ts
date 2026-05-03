import { describe, expect, it } from 'vitest';
import { createWorkflowGraphEditorActions } from '@/features/workflow/lib/store/editorGraph';
import { createWorkflowStoreHarness } from './testHarness';

describe('workflow store graph editor actions', () => {
  it('replaces an existing connection on the same target handle', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'sourceA', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
        { id: 'sourceB', type: 'textInput', position: { x: 0, y: 80 }, data: {} },
        { id: 'merge', type: 'textMerge', position: { x: 220, y: 0 }, data: { inputCount: 1 } },
      ],
      edges: [
        {
          id: 'edge_existing',
          source: 'sourceA',
          sourceHandle: 'output',
          target: 'merge',
          targetHandle: 'item2',
        },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.addEdge('sourceB', 'output', 'merge', 'item2');

    const state = harness.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]?.source).toBe('sourceB');
    expect(state.edges[0]?.target).toBe('merge');
    expect(state.edges[0]?.targetHandle).toBe('item2');
    expect(state.nodes.find((node) => node.id === 'merge')?.data.inputCount).toBe(3);
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('removes descendant nodes, connected edges, and execution residue together', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: {} },
        { id: 'child', type: 'textInput', position: { x: 24, y: 24 }, parentId: 'group', extent: 'parent', data: {} },
        { id: 'output', type: 'output', position: { x: 360, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: 'edge_child_output',
          source: 'child',
          sourceHandle: 'output',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      selectedNodeId: 'child',
      nodeExecStatus: { child: 'success', group: 'idle' },
      nodeExecutionTime: { child: 1200 },
      nodeExecutionStartedAt: { child: 100 },
      nodeErrors: { child: 'stale error' },
      nodeWarnings: { child: 'stale warning' },
      nodeOutputs: { child: { text: 'done' } },
      workflowWarningMessage: 'stale workflow warning',
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.removeNodes(['group']);

    const state = harness.getState();
    expect(state.nodes.map((node) => node.id)).toEqual(['output']);
    expect(state.edges).toEqual([]);
    expect(state.selectedNodeId).toBeNull();
    expect(state.nodeExecStatus).toEqual({});
    expect(state.nodeExecutionTime).toEqual({});
    expect(state.nodeExecutionStartedAt).toEqual({});
    expect(state.nodeErrors).toEqual({});
    expect(state.nodeWarnings).toEqual({});
    expect(state.nodeOutputs).toEqual({});
    expect(state.workflowWarningMessage).toBeNull();
    expect(state.hasUnsavedChanges).toBe(true);
  });
});
