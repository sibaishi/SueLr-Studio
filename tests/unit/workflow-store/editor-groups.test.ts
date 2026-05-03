import { describe, expect, it } from 'vitest';
import { createWorkflowGroupEditorActions } from '@/features/workflow/lib/store/editorGroups';
import { createWorkflowStoreHarness } from './testHarness';

describe('workflow store group editor actions', () => {
  it('creates a group around selected nodes and selects the new group', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'a', type: 'textInput', position: { x: 84, y: 112 }, data: {} },
        { id: 'b', type: 'output', position: { x: 308, y: 112 }, data: {} },
      ],
    });

    const actions = createWorkflowGroupEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    const groupId = actions.createNodeGroup(['a', 'b']);

    const state = harness.getState();
    expect(groupId).toBeTruthy();
    expect(state.selectedNodeId).toBe(groupId);
    expect(state.hasUnsavedChanges).toBe(true);
    expect(state.nodes.find((node) => node.id === groupId)?.type).toBe('group');
    expect(state.nodes.find((node) => node.id === 'a')?.parentId).toBe(groupId);
    expect(state.nodes.find((node) => node.id === 'b')?.parentId).toBe(groupId);
  });

  it('ungroups children back to root nodes with absolute positions', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 56, y: 84 },
          width: 392,
          height: 280,
          data: {},
        },
        {
          id: 'child',
          type: 'textInput',
          position: { x: 84, y: 112 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      selectedNodeId: 'group',
    });

    const actions = createWorkflowGroupEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.ungroupNodes(['group']);

    const state = harness.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.id).toBe('child');
    expect(state.nodes[0]?.parentId).toBeUndefined();
    expect(state.nodes[0]?.position).toEqual({ x: 140, y: 196 });
    expect(state.selectedNodeId).toBeNull();
    expect(state.hasUnsavedChanges).toBe(true);
  });
});
