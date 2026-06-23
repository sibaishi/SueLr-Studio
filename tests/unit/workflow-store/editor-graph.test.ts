import { describe, expect, it } from 'vitest';
import { createWorkflowGraphEditorActions } from '@/domains/workflow/lib/store/editorGraph';
import { createWorkflowGroupEditorActions } from '@/domains/workflow/lib/store/editorGroups';
import { getEffectiveNodeSize } from '@/domains/workflow/lib/groupLayout';
import { createWorkflowStoreHarness } from './testHarness';

function getBoundsCenter(nodes: Array<{ position: { x: number; y: number } } & Parameters<typeof getEffectiveNodeSize>[0]>) {
  const bounds = nodes.reduce((acc, node) => {
    const size = getEffectiveNodeSize(node);
    return {
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + size.width),
      maxY: Math.max(acc.maxY, node.position.y + size.height),
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

describe('workflow store graph editor actions', () => {
  it('keeps multiple new IO connections on the unified Midjourney input handle', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'promptA', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'promptB', type: 'io', position: { x: 0, y: 80 }, data: {} },
        { id: 'ai', type: 'aiV3', position: { x: 240, y: 0 }, data: {} },
      ],
      edges: [],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.addEdge('promptA', 'result', 'ai', 'input');
    actions.addEdge('promptB', 'result', 'ai', 'input');

    expect(harness.getState().edges).toEqual([
      expect.objectContaining({
        source: 'promptA',
        sourceHandle: 'result',
        target: 'ai',
        targetHandle: 'input',
      }),
      expect.objectContaining({
        source: 'promptB',
        sourceHandle: 'result',
        target: 'ai',
        targetHandle: 'input',
      }),
    ]);
  });

  it('rejects a connection that would nest two iterating material processors', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'first', type: 'materialProcess', position: { x: 0, y: 0 }, data: { iterateEnabled: true } },
        { id: 'middle', type: 'io', position: { x: 220, y: 0 }, data: {} },
        { id: 'second', type: 'materialProcess', position: { x: 440, y: 0 }, data: { iterateEnabled: true } },
      ],
      edges: [{ id: 'existing', source: 'first', sourceHandle: 'result', target: 'middle', targetHandle: 'input' }],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.addEdge('middle', 'result', 'second', 'input');

    expect(harness.getState().edges).toHaveLength(1);
  });

  it('allows independent parallel branches to iterate separately', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'sourceA', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'sourceB', type: 'io', position: { x: 0, y: 120 }, data: {} },
        { id: 'iterateA', type: 'materialProcess', position: { x: 220, y: 0 }, data: { iterateEnabled: true } },
        { id: 'iterateB', type: 'materialProcess', position: { x: 220, y: 120 }, data: { iterateEnabled: true } },
      ],
      edges: [],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);
    actions.addEdge('sourceA', 'result', 'iterateA', 'input');
    actions.addEdge('sourceB', 'result', 'iterateB', 'input');

    expect(harness.getState().edges).toHaveLength(2);
  });

  it('keeps exactly one trailing empty group input slot after edge mutations', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_a',
                label: 'Input 1',
                type: 'any',
                binding: { nodeId: 'child', handleId: 'input' },
              },
              {
                id: 'port_b',
                label: 'Input 2',
                type: 'any',
                binding: null,
              },
              {
                id: 'port_c',
                label: 'Input 3',
                type: 'any',
                binding: null,
              },
            ],
          },
        },
        {
          id: 'child',
          type: 'aiV3',
          position: { x: 56, y: 84 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      edges: [],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.onEdgesChange([]);

    const state = harness.getState();
    const groupNode = state.nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      insideLinks: [{ nodeId: 'child', handleId: 'input' }],
      outsideLinks: [],
      type: 'any',
    });
    expect(inputs[1]).toMatchObject({ insideLinks: [], outsideLinks: [], type: null });
  });

  it('removes descendant nodes, connected edges, and execution residue together', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: {} },
        { id: 'child', type: 'io', position: { x: 24, y: 24 }, parentId: 'group', extent: 'parent', data: {} },
        { id: 'output', type: 'io', position: { x: 360, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: 'edge_child_output',
          source: 'child',
          sourceHandle: 'result',
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

  it('removes stale group port links when deleting connected child nodes', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: 'Input 1',
                type: 'string',
                insideLinks: [{ nodeId: 'child', handleId: 'input' }],
                outsideLinks: [{ nodeId: 'source', handleId: 'result' }],
              },
            ],
          },
        },
        { id: 'source', type: 'io', position: { x: -240, y: 0 }, data: {} },
        { id: 'child', type: 'aiV3', position: { x: 56, y: 84 }, parentId: 'group', extent: 'parent', data: {} },
      ],
      edges: [
        {
          id: 'outside-to-group',
          source: 'source',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'group-to-child',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'child',
          targetHandle: 'input',
        },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.removeNodes(['child']);

    const state = harness.getState();
    const groupNode = state.nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(state.edges).toEqual([]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      type: null,
      insideLinks: [],
      outsideLinks: [],
    });
  });

  it('detaches a middle node and reconnects compatible upstream and downstream nodes', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'chat', type: 'aiV3', position: { x: 240, y: 0 }, data: {} },
        { id: 'output', type: 'io', position: { x: 520, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge_in', source: 'input', sourceHandle: 'result', target: 'chat', targetHandle: 'input' },
        { id: 'edge_out', source: 'chat', sourceHandle: 'result', target: 'output', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.detachNodeFromChain('chat');

    const state = harness.getState();
    expect(state.nodes.map((node) => node.id)).toEqual(['input', 'chat', 'output']);
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({
      source: 'input',
      sourceHandle: 'result',
      target: 'output',
      targetHandle: 'input',
    });
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('reconnects compatible upstream and downstream nodes when deleting a single middle node', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'chat', type: 'aiV3', position: { x: 240, y: 0 }, data: {} },
        { id: 'output', type: 'io', position: { x: 520, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge_in', source: 'input', sourceHandle: 'result', target: 'chat', targetHandle: 'input' },
        { id: 'edge_out', source: 'chat', sourceHandle: 'result', target: 'output', targetHandle: 'input' },
      ],
      selectedNodeId: 'chat',
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.removeNode('chat');

    const state = harness.getState();
    expect(state.nodes.map((node) => node.id)).toEqual(['input', 'output']);
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({
      source: 'input',
      sourceHandle: 'result',
      target: 'output',
      targetHandle: 'input',
    });
    expect(state.selectedNodeId).toBeNull();
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('inserts a node onto an existing compatible edge', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'io', type: 'io', position: { x: 0, y: 0 }, data: {} },
        { id: 'resize', type: 'materialProcess', position: { x: 240, y: 0 }, data: { iterateEnabled: false } },
        { id: 'merge', type: 'io', position: { x: 520, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge_original', source: 'io', sourceHandle: 'result', target: 'merge', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.insertNodeOnEdge('resize', 'edge_original');

    const state = harness.getState();
    expect(state.edges).toHaveLength(2);
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'io',
        sourceHandle: 'result',
        target: 'resize',
        targetHandle: 'input',
      }),
      expect.objectContaining({
        source: 'resize',
        sourceHandle: 'result',
        target: 'merge',
        targetHandle: 'input',
      }),
    ]));
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('does not insert an iterator into an existing iterating path', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'io', type: 'materialProcess', position: { x: 0, y: 0 }, data: { iterateEnabled: true } },
        { id: 'chat', type: 'materialProcess', position: { x: 240, y: 0 }, data: { iterateEnabled: true } },
        { id: 'merge', type: 'io', position: { x: 520, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'edge_original', source: 'io', sourceHandle: 'result', target: 'merge', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.insertNodeOnEdge('chat', 'edge_original');

    const state = harness.getState();
    expect(state.edges).toEqual([
      { id: 'edge_original', source: 'io', sourceHandle: 'result', target: 'merge', targetHandle: 'input' },
    ]);
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it('locks selected nodes and blocks subsequent graph changes', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'lockedNode', type: 'io', position: { x: 0, y: 0 }, data: {} },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.toggleNodesLocked(['lockedNode'], true);
    actions.onNodesChange([
      {
        id: 'lockedNode',
        type: 'position',
        position: { x: 240, y: 160 },
        dragging: false,
      },
    ]);

    const state = harness.getState();
    expect(state.nodes[0]?.data.locked).toBe(true);
    expect(state.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it('allows internal dimensions updates for locked nodes so restored edges can remeasure handles', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'lockedNode', type: 'io', position: { x: 0, y: 0 }, data: { locked: true } },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.onNodesChange([
      {
        id: 'lockedNode',
        type: 'dimensions',
        dimensions: { width: 260, height: 180 },
      },
    ]);

    const state = harness.getState();
    expect(state.nodes[0]?.measured).toEqual({ width: 260, height: 180 });
    expect(state.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it('auto arranges root nodes by dependency columns and snaps them to the grid', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'input', type: 'io', position: { x: 300, y: 300 }, data: {} },
        { id: 'chat', type: 'aiV3', position: { x: 120, y: 40 }, data: {} },
        { id: 'output', type: 'io', position: { x: 40, y: 260 }, data: {} },
      ],
      edges: [
        { id: 'edge_a', source: 'input', sourceHandle: 'result', target: 'chat', targetHandle: 'input' },
        { id: 'edge_b', source: 'chat', sourceHandle: 'result', target: 'output', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const input = state.nodes.find((node) => node.id === 'input');
    const chat = state.nodes.find((node) => node.id === 'chat');
    const output = state.nodes.find((node) => node.id === 'output');

    expect(input?.position.x).toBeLessThan(chat?.position.x ?? 0);
    expect(chat?.position.x).toBeLessThan(output?.position.x ?? 0);
    expect(Math.abs((input?.position.x ?? 1) % 28)).toBe(0);
    expect(Math.abs((chat?.position.y ?? 1) % 28)).toBe(0);
    expect(state.hasUnsavedChanges).toBe(true);
  });

  it('auto arranges group children while preserving locked nodes and resizing the group', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'group', type: 'group', position: { x: 0, y: 0 }, width: 280, height: 280, data: {} },
        { id: 'lockedChild', type: 'io', position: { x: 56, y: 84 }, parentId: 'group', extent: 'parent', data: { locked: true } },
        { id: 'freeChild', type: 'io', position: { x: 24, y: 196 }, parentId: 'group', extent: 'parent', data: {} },
      ],
      edges: [],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const group = state.nodes.find((node) => node.id === 'group');
    const lockedChild = state.nodes.find((node) => node.id === 'lockedChild');
    const freeChild = state.nodes.find((node) => node.id === 'freeChild');

    expect(lockedChild?.position).toEqual({ x: 56, y: 140 });
    expect(Math.abs((freeChild?.position.x ?? 1) % 28)).toBe(0);
    expect(Math.abs((freeChild?.position.y ?? 1) % 28)).toBe(0);
    expect(group?.width).toBeGreaterThanOrEqual(280);
    expect(group?.height).toBeGreaterThanOrEqual(280);
  });

  it('only arranges the selected subset when there is an active selection', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'selectedA', type: 'io', position: { x: 300, y: 280 }, data: {}, selected: true },
        { id: 'selectedB', type: 'aiV3', position: { x: 120, y: 56 }, data: {}, selected: true },
        { id: 'untouched', type: 'io', position: { x: 812, y: 476 }, data: {}, selected: false },
      ],
      edges: [
        { id: 'edge_sel', source: 'selectedA', sourceHandle: 'result', target: 'selectedB', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const selectedA = state.nodes.find((node) => node.id === 'selectedA');
    const selectedB = state.nodes.find((node) => node.id === 'selectedB');
    const untouched = state.nodes.find((node) => node.id === 'untouched');

    expect(selectedA?.position.x).toBeLessThan(selectedB?.position.x ?? 0);
    expect(untouched?.position).toEqual({ x: 812, y: 476 });
  });

  it('arranges descendants of a selected group together', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'group', type: 'group', position: { x: 0, y: 0 }, width: 392, height: 336, data: {}, selected: true },
        { id: 'childA', type: 'io', position: { x: 196, y: 196 }, parentId: 'group', extent: 'parent', data: {} },
        { id: 'childB', type: 'io', position: { x: 56, y: 84 }, parentId: 'group', extent: 'parent', data: {} },
      ],
      edges: [
        { id: 'edge_group', source: 'childA', sourceHandle: 'result', target: 'childB', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const childA = state.nodes.find((node) => node.id === 'childA');
    const childB = state.nodes.find((node) => node.id === 'childB');

    expect(childA?.position.x).toBeLessThan(childB?.position.x ?? 0);
    expect(Math.abs((childA?.position.x ?? 1) % 28)).toBe(0);
    expect(Math.abs((childB?.position.y ?? 1) % 28)).toBe(0);
  });

  it('orders nodes within a layer by upstream flow to reduce crossing', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'leftTop', type: 'io', position: { x: 56, y: 56 }, data: {} },
        { id: 'leftBottom', type: 'io', position: { x: 56, y: 420 }, data: {} },
        { id: 'rightTop', type: 'aiV3', position: { x: 560, y: 420 }, data: {} },
        { id: 'rightBottom', type: 'aiV3', position: { x: 560, y: 56 }, data: {} },
      ],
      edges: [
        { id: 'edge_top', source: 'leftTop', sourceHandle: 'result', target: 'rightTop', targetHandle: 'input' },
        { id: 'edge_bottom', source: 'leftBottom', sourceHandle: 'result', target: 'rightBottom', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const rightTop = state.nodes.find((node) => node.id === 'rightTop');
    const rightBottom = state.nodes.find((node) => node.id === 'rightBottom');

    expect((rightTop?.position.y ?? 0)).toBeLessThan(rightBottom?.position.y ?? 0);
  });

  it('keeps disconnected chains as separate blocks and stacks them vertically', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        { id: 'chainATop', type: 'io', position: { x: 56, y: 420 }, data: {} },
        { id: 'chainABottom', type: 'aiV3', position: { x: 560, y: 84 }, data: {} },
        { id: 'chainBTop', type: 'io', position: { x: 84, y: 1120 }, data: {} },
        { id: 'chainBBottom', type: 'io', position: { x: 588, y: 700 }, data: {} },
      ],
      edges: [
        { id: 'edge_a', source: 'chainATop', sourceHandle: 'result', target: 'chainABottom', targetHandle: 'input' },
        { id: 'edge_b', source: 'chainBTop', sourceHandle: 'result', target: 'chainBBottom', targetHandle: 'input' },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const chainATop = state.nodes.find((node) => node.id === 'chainATop');
    const chainABottom = state.nodes.find((node) => node.id === 'chainABottom');
    const chainBTop = state.nodes.find((node) => node.id === 'chainBTop');
    const chainBBottom = state.nodes.find((node) => node.id === 'chainBBottom');

    expect(chainATop?.position.x).toBeLessThan(chainABottom?.position.x ?? 0);
    expect(chainBTop?.position.x).toBeLessThan(chainBBottom?.position.x ?? 0);
    expect((chainATop?.position.y ?? 0)).toBeLessThan(chainBTop?.position.y ?? 0);
    expect((chainABottom?.position.y ?? 0)).toBeLessThan(chainBBottom?.position.y ?? 0);
  });

  it('keeps the root arrangement near the original bounding-box center', () => {
    const originalNodes = [
      { id: 'left', type: 'io', position: { x: 840, y: 308 }, data: {} },
      { id: 'middle', type: 'aiV3', position: { x: 1596, y: 560 }, data: {} },
      { id: 'right', type: 'io', position: { x: 2380, y: 896 }, data: {} },
    ];
    const harness = createWorkflowStoreHarness({
      nodes: originalNodes,
      edges: [
        { id: 'edge_left', source: 'left', sourceHandle: 'result', target: 'middle', targetHandle: 'input' },
        { id: 'edge_right', source: 'middle', sourceHandle: 'result', target: 'right', targetHandle: 'input' },
      ],
    });

    const originalCenter = getBoundsCenter(originalNodes);
    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.autoArrangeWorkflow();

    const state = harness.getState();
    const arrangedNodes = ['left', 'middle', 'right']
      .map((id) => state.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    const arrangedCenter = getBoundsCenter(arrangedNodes);

    expect(Math.abs(arrangedCenter.x - originalCenter.x)).toBeLessThanOrEqual(28);
    expect(Math.abs(arrangedCenter.y - originalCenter.y)).toBeLessThanOrEqual(28);
  });

  it('keeps child node positions stable when collapsing and expanding a group', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          width: 840,
          height: 560,
          data: {},
        },
        {
          id: 'childA',
          type: 'io',
          position: { x: 84, y: 112 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
        {
          id: 'childB',
          type: 'io',
          position: { x: 420, y: 224 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      edges: [],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.toggleGroupCollapsed('group', true);
    let state = harness.getState();
    expect(state.nodes.find((node) => node.id === 'childA')?.position).toEqual({ x: 84, y: 112 });
    expect(state.nodes.find((node) => node.id === 'childB')?.position).toEqual({ x: 420, y: 224 });

    actions.toggleGroupCollapsed('group', false);
    state = harness.getState();
    expect(state.nodes.find((node) => node.id === 'childA')?.position).toEqual({ x: 84, y: 140 });
    expect(state.nodes.find((node) => node.id === 'childB')?.position).toEqual({ x: 420, y: 224 });
    expect(state.nodes.find((node) => node.id === 'group')?.width).toBe(840);
    expect(state.nodes.find((node) => node.id === 'group')?.height).toBe(560);
  });

  it('restores mapped group port edges into ordinary edges when ungrouping', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 280, y: 140 },
          width: 560,
          height: 392,
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: 'Input 1',
                type: 'string',
                binding: { nodeId: 'childIn', handleId: 'input' },
              },
              {
                id: 'port_in_empty',
                label: 'Input 2',
                type: null,
                binding: null,
              },
            ],
            groupOutputs: [
              {
                id: 'port_out',
                label: 'Output 1',
                type: 'string',
                binding: { nodeId: 'childOut', handleId: 'result' },
              },
              {
                id: 'port_out_empty',
                label: 'Output 2',
                type: null,
                binding: null,
              },
            ],
          },
        },
        { id: 'source', type: 'io', position: { x: 0, y: 180 }, data: {} },
        { id: 'sink', type: 'io', position: { x: 980, y: 180 }, data: {} },
        {
          id: 'childIn',
          type: 'aiV3',
          position: { x: 56, y: 140 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
        {
          id: 'childOut',
          type: 'io',
          position: { x: 280, y: 252 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_external_in',
          source: 'source',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'edge_internal_in',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'childIn',
          targetHandle: 'input',
        },
        {
          id: 'edge_internal_out',
          source: 'childOut',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:output:internal:port_out',
        },
        {
          id: 'edge_external_out',
          source: 'group',
          sourceHandle: 'group-port:output:external:port_out',
          target: 'sink',
          targetHandle: 'input',
        },
      ],
    });

    const graphActions = createWorkflowGraphEditorActions(harness.set, harness.get);
    const groupActions = createWorkflowGroupEditorActions(harness.set, harness.get);
    harness.attachActions(graphActions);
    harness.attachActions(groupActions);

    groupActions.ungroupNodes(['group']);

    const state = harness.getState();

    expect(state.nodes.some((node) => node.id === 'group')).toBe(false);
    expect(state.edges).toHaveLength(2);
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'result',
        target: 'childIn',
        targetHandle: 'input',
      }),
      expect.objectContaining({
        source: 'childOut',
        sourceHandle: 'result',
        target: 'sink',
        targetHandle: 'input',
      }),
    ]));
  });

  it('removes external group edges when a mapped group port is unbound', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: 'Input 1',
                type: 'string',
                binding: { nodeId: 'child', handleId: 'input' },
              },
              {
                id: 'port_empty',
                label: 'Input 2',
                type: null,
                binding: null,
              },
            ],
          },
        },
        {
          id: 'source',
          type: 'io',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'child',
          type: 'aiV3',
          position: { x: 56, y: 84 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_external',
          source: 'source',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'edge_internal',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'child',
          targetHandle: 'input',
        },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.updateGroupPort('group', 'input', 'port_in', {
      insideLinks: [],
      outsideLinks: [],
      type: null,
    });

    const state = harness.getState();
    const groupNode = state.nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(state.edges).toEqual([]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ insideLinks: [], outsideLinks: [], type: null });
  });

  it('removing the last internal group edge also clears the remaining virtual binding', () => {
    const harness = createWorkflowStoreHarness({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: {
            groupInputs: [
              {
                id: 'port_in',
                label: 'Input 1',
                type: 'string',
                insideLinks: [{ nodeId: 'child', handleId: 'input' }],
                outsideLinks: [{ nodeId: 'source', handleId: 'result' }],
              },
              {
                id: 'port_empty',
                label: 'Input 2',
                type: null,
                insideLinks: [],
                outsideLinks: [],
              },
            ],
          },
        },
        {
          id: 'source',
          type: 'io',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'child',
          type: 'aiV3',
          position: { x: 56, y: 84 },
          parentId: 'group',
          extent: 'parent',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_external',
          source: 'source',
          sourceHandle: 'result',
          target: 'group',
          targetHandle: 'group-port:input:external:port_in',
        },
        {
          id: 'edge_internal',
          source: 'group',
          sourceHandle: 'group-port:input:internal:port_in',
          target: 'child',
          targetHandle: 'input',
        },
      ],
    });

    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);

    actions.removeEdge('edge_internal');

    const state = harness.getState();
    const groupNode = state.nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(state.edges).toEqual([]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      insideLinks: [],
      outsideLinks: [],
      type: null,
    });
  });
});
