import { describe, expect, it } from 'vitest';
import { buildGroupPortsFromBoundaryEdges, normalizeGroupPortNodes } from '@/domains/workflow/lib/groupPorts';

describe('group port helpers', () => {
  it('builds facade transit ports from boundary edges and keeps one trailing empty slot', () => {
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

    expect(result.groupInputs).toHaveLength(3);
    expect(result.groupOutputs).toHaveLength(2);
    expect(result.groupInputs[0]).toMatchObject({
      type: 'string',
      insideLinks: [{ nodeId: 'inner', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'sourceA', handleId: 'text' }],
    });
    expect(result.groupInputs[1]).toMatchObject({
      type: 'string',
      insideLinks: [{ nodeId: 'inner', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'sourceB', handleId: 'text' }],
    });
    expect(result.groupOutputs[0]).toMatchObject({
      type: 'string',
      insideLinks: [{ nodeId: 'inner', handleId: 'response' }],
      outsideLinks: [
        { nodeId: 'outside', handleId: 'content' },
        { nodeId: 'sourceA', handleId: 'text' },
      ],
    });
    expect(result.groupInputs[2]).toMatchObject({ insideLinks: [], outsideLinks: [], type: null });
    expect(result.groupOutputs[1]).toMatchObject({ insideLinks: [], outsideLinks: [], type: null });
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
      insideLinks: [{ nodeId: 'child', handleId: 'prompt' }],
      outsideLinks: [],
      type: 'string',
    });
    expect(inputs[1]).toMatchObject({ insideLinks: [], outsideLinks: [], type: null });
  });

  it('ignores current group helper edges when rebuilding ports for an existing group node', () => {
    const nodes = normalizeGroupPortNodes([
      {
        id: 'source',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'group',
        type: 'group',
        position: { x: 240, y: 0 },
        data: {
          groupInputs: [
            {
              id: 'port_in',
              label: 'Input 1',
              type: 'string',
              insideLinks: [{ nodeId: 'child', handleId: 'prompt' }],
              outsideLinks: [{ nodeId: 'source', handleId: 'text' }],
            },
          ],
          groupOutputs: [
            {
              id: 'port_out',
              label: 'Output 1',
              type: 'string',
              insideLinks: [{ nodeId: 'child', handleId: 'response' }],
              outsideLinks: [{ nodeId: 'sink', handleId: 'content' }],
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
      {
        id: 'sink',
        type: 'saveFile',
        position: { x: 640, y: 0 },
        data: {},
      },
    ], [
      {
        id: 'outside-to-group',
        source: 'source',
        sourceHandle: 'text',
        target: 'group',
        targetHandle: 'group-port:input:external:port_in',
      },
      {
        id: 'group-to-child',
        source: 'group',
        sourceHandle: 'group-port:input:internal:port_in',
        target: 'child',
        targetHandle: 'prompt',
      },
      {
        id: 'child-to-group',
        source: 'child',
        sourceHandle: 'response',
        target: 'group',
        targetHandle: 'group-port:output:internal:port_out',
      },
      {
        id: 'group-to-outside',
        source: 'group',
        sourceHandle: 'group-port:output:external:port_out',
        target: 'sink',
        targetHandle: 'content',
      },
    ]);

    const groupNode = nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];
    const outputs = Array.isArray(groupNode?.data?.groupOutputs) ? groupNode.data.groupOutputs : [];

    expect(inputs[0]).toMatchObject({
      insideLinks: [{ nodeId: 'child', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'source', handleId: 'text' }],
      type: 'string',
    });
    expect(outputs[0]).toMatchObject({
      insideLinks: [{ nodeId: 'child', handleId: 'response' }],
      outsideLinks: [{ nodeId: 'sink', handleId: 'content' }],
      type: 'string',
    });
    expect(inputs.flatMap((port) => port.outsideLinks).some((link) => link.nodeId === 'group')).toBe(false);
    expect(outputs.flatMap((port) => port.outsideLinks).some((link) => link.nodeId === 'group')).toBe(false);
  });

  it('treats persisted group port links as derived from current edges when normalizing existing groups', () => {
    const nodes = normalizeGroupPortNodes([
      {
        id: 'source',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'group',
        type: 'group',
        position: { x: 240, y: 0 },
        data: {
          groupInputs: [
            {
              id: 'port_in',
              label: 'Input 1',
              type: 'string',
              insideLinks: [{ nodeId: 'child', handleId: 'prompt' }],
              outsideLinks: [{ nodeId: 'group', handleId: 'group-port:input:internal:port_in' }],
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
    ], [
      {
        id: 'group-to-child',
        source: 'group',
        sourceHandle: 'group-port:input:internal:port_in',
        target: 'child',
        targetHandle: 'prompt',
      },
      {
        id: 'source-to-group',
        source: 'source',
        sourceHandle: 'text',
        target: 'group',
        targetHandle: 'group-port:input:external:port_in',
      },
    ]);

    const groupNode = nodes.find((node) => node.id === 'group');
    const inputs = Array.isArray(groupNode?.data?.groupInputs) ? groupNode.data.groupInputs : [];

    expect(inputs[0]).toMatchObject({
      insideLinks: [{ nodeId: 'child', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'source', handleId: 'text' }],
      type: 'string',
    });
    expect(inputs.flatMap((port) => port.outsideLinks).some((link) => link.nodeId === 'group')).toBe(false);
  });
});
