import { describe, expect, it } from 'vitest';
import { createWorkflowGroupEditorActions } from '@/domains/workflow/lib/store/editorGroups';
import { createWorkflowStoreHarness } from './testHarness';

describe('workflow store group editor actions', () => {
  it('creates a group around selected nodes and selects the new group', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'a', type: 'io', position: { x: 84, y: 112 }, data: {} },
        { id: 'b', type: 'io', position: { x: 308, y: 112 }, data: {} },
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
        { id: 'source', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'innerA', type: 'aiV3', position: { x: 224, y: 0 }, data: {} },
        { id: 'innerB', type: 'io', position: { x: 476, y: 0 }, data: {} },
        { id: 'outside', type: 'io', position: { x: 728, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'source', sourceHandle: 'result', target: 'innerA', targetHandle: 'input' },
        { id: 'e2', source: 'innerA', sourceHandle: 'result', target: 'outside', targetHandle: 'input' },
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
      type: 'any',
      insideLinks: [{
        nodeId: 'innerA',
        handleId: 'input',
      }],
      outsideLinks: [{
        nodeId: 'source',
        handleId: 'result',
      }],
    });
    expect(outputs[0]).toMatchObject({
      type: 'any',
      insideLinks: [{
        nodeId: 'innerA',
        handleId: 'result',
      }],
      outsideLinks: [{
        nodeId: 'outside',
        handleId: 'input',
      }],
    });
    expect(inputs[1]).toMatchObject({ insideLinks: [], outsideLinks: [] });
    expect(outputs[1]).toMatchObject({ insideLinks: [], outsideLinks: [] });
    expect(groupNode?.data?.collapsed).toBe(false);
    expect(state.edges).toHaveLength(4);
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'result',
        target: groupId,
        targetHandle: expect.stringContaining('group-port:input:external:'),
      }),
      expect.objectContaining({
        source: groupId,
        sourceHandle: expect.stringContaining('group-port:input:internal:'),
        target: 'innerA',
        targetHandle: 'input',
      }),
      expect.objectContaining({
        source: 'innerA',
        sourceHandle: 'result',
        target: groupId,
        targetHandle: expect.stringContaining('group-port:output:internal:'),
      }),
      expect.objectContaining({
        source: groupId,
        sourceHandle: expect.stringContaining('group-port:output:external:'),
        target: 'outside',
        targetHandle: 'input',
      }),
    ]));
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
          type: 'io',
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

  it('restores fan-out group input edges with unique ids when ungrouping', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'source', type: 'io', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'group',
          type: 'group',
          position: { x: 220, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: 'Input 1',
                type: 'any',
                insideLinks: [
                  { nodeId: 'innerA', handleId: 'input' },
                  { nodeId: 'innerB', handleId: 'input' },
                ],
                outsideLinks: [{ nodeId: 'source', handleId: 'result' }],
              },
            ],
          },
        },
        { id: 'innerA', type: 'aiV3', position: { x: 56, y: 84 }, parentId: 'group', extent: 'parent', data: {} },
        { id: 'innerB', type: 'aiV3', position: { x: 56, y: 252 }, parentId: 'group', extent: 'parent', data: {} },
      ],
      edges: [
        {
          id: 'edge_outside_group',
          source: 'source',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'edge_group_inner_a',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'innerA',
          targetHandle: 'input',
        },
        {
          id: 'edge_group_inner_b',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'innerB',
          targetHandle: 'input',
        },
      ],
    });

    const actions = createWorkflowGroupEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.ungroupNodes(['group']);

    const state = harness.getState();
    const edgeIds = state.edges.map((edge) => edge.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'result',
        target: 'innerA',
        targetHandle: 'input',
      }),
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'result',
        target: 'innerB',
        targetHandle: 'input',
      }),
    ]));
    expect(state.edges).toHaveLength(2);
  });
});
