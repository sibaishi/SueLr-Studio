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

  it('auto exposes boundary edges as group facade ports when grouping', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'source', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
        { id: 'innerA', type: 'aiChat', position: { x: 224, y: 0 }, data: {} },
        { id: 'innerB', type: 'output', position: { x: 476, y: 0 }, data: {} },
        { id: 'outside', type: 'saveFile', position: { x: 728, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'source', sourceHandle: 'text', target: 'innerA', targetHandle: 'prompt' },
        { id: 'e2', source: 'innerA', sourceHandle: 'response', target: 'outside', targetHandle: 'content' },
      ],
    });

    const actions = createWorkflowGroupEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    const groupId = actions.createNodeGroup(['innerA', 'innerB']);
    const state = harness.getState();
    const groupNode = state.nodes.find((node) => node.id === groupId);
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];
    const outputs = Array.isArray(groupNode?.data?.groupOutputs) ? groupNode.data.groupOutputs : [];

    expect(inputs).toHaveLength(2);
    expect(outputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      type: 'string',
      binding: {
        nodeId: 'innerA',
        handleId: 'prompt',
      },
    });
    expect(outputs[0]).toMatchObject({
      type: 'string',
      binding: {
        nodeId: 'innerA',
        handleId: 'response',
      },
    });
    expect(inputs[1]).toMatchObject({ binding: null });
    expect(outputs[1]).toMatchObject({ binding: null });
    expect(groupNode?.data?.collapsed).toBe(false);
    expect(state.edges).toEqual([
      {
        id: 'e1',
        source: 'source',
        sourceHandle: 'text',
        target: groupId,
        targetHandle: expect.stringContaining('group-port:input:external:'),
      },
      {
        id: 'e2',
        source: groupId,
        sourceHandle: expect.stringContaining('group-port:output:external:'),
        target: 'outside',
        targetHandle: 'content',
      },
    ]);
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
