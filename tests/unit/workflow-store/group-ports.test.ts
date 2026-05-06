import { describe, expect, it } from 'vitest';
import { buildGroupPortsFromBoundaryEdges, normalizeGroupPortNodes } from '@/features/workflow/lib/groupPorts';

describe('group port helpers', () => {
  it('builds deduplicated facade ports from boundary edges and keeps one trailing empty slot', () => {
    const nodes = [
      { id: 'sourceA', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
      { id: 'sourceB', type: 'textInput', position: { x: 0, y: 120 }, data: {} },
      { id: 'inner', type: 'aiChat', position: { x: 240, y: 0 }, data: {} },
      { id: 'outside', type: 'saveFile', position: { x: 520, y: 0 }, data: {} },
    ];
    const edges = [
      { id: 'e1', source: 'sourceA', sourceHandle: 'text', target: 'inner', targetHandle: 'prompt' },
      { id: 'e2', source: 'sourceB', sourceHandle: 'text', target: 'inner', targetHandle: 'prompt' },
      { id: 'e3', source: 'inner', sourceHandle: 'response', target: 'outside', targetHandle: 'content' },
      { id: 'e4', source: 'inner', sourceHandle: 'response', target: 'sourceA', targetHandle: 'text' },
    ];

    const result = buildGroupPortsFromBoundaryEdges(nodes, edges, ['inner']);

    expect(result.groupInputs).toHaveLength(2);
    expect(result.groupOutputs).toHaveLength(2);
    expect(result.groupInputs[0]).toMatchObject({
      type: 'string',
      binding: { nodeId: 'inner', handleId: 'prompt' },
    });
    expect(result.groupOutputs[0]).toMatchObject({
      type: 'string',
      binding: { nodeId: 'inner', handleId: 'response' },
    });
    expect(result.groupInputs[1]).toMatchObject({ binding: null, type: null });
    expect(result.groupOutputs[1]).toMatchObject({ binding: null, type: null });
  });

  it('drops invalid group port bindings and preserves a single trailing empty slot', () => {
    const nodes = normalizeGroupPortNodes([
      {
        id: 'group',
        type: 'group',
        position: { x: 0, y: 0 },
        data: {
          groupInputs: [
            {
              id: 'port_valid',
              label: 'Input 1',
              type: 'string',
              binding: { nodeId: 'child', handleId: 'prompt' },
            },
            {
              id: 'port_missing_node',
              label: 'Input 2',
              type: 'string',
              binding: { nodeId: 'ghost', handleId: 'prompt' },
            },
            {
              id: 'port_duplicate',
              label: 'Input 3',
              type: 'string',
              binding: { nodeId: 'child', handleId: 'prompt' },
            },
            {
              id: 'port_empty_a',
              label: 'Input 4',
              type: 'any',
              binding: null,
            },
            {
              id: 'port_empty_b',
              label: 'Input 5',
              type: 'any',
              binding: null,
            },
          ],
        },
      },
      {
        id: 'child',
        type: 'aiChat',
        position: { x: 48, y: 96 },
        parentId: 'group',
        extent: 'parent',
        data: {},
      },
    ], []);

    const groupNode = nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      binding: { nodeId: 'child', handleId: 'prompt' },
      type: 'string',
    });
    expect(inputs[1]).toMatchObject({ binding: null, type: null });
  });
});
