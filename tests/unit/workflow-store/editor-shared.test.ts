import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { autoArrangeNodes, isNodeLockedWithAncestors, normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';

describe('workflow store shared editor helpers', () => {
  it('clamps only children outside group bounds without resizing the group', () => {
    const nodes: Node[] = [
      { id: 'group', type: 'group', position: { x: 0, y: 0 }, width: 840, height: 700, data: {} },
      { id: 'near', type: 'io', parentId: 'group', position: { x: 5, y: 60 }, data: {} },
      { id: 'inside', type: 'io', parentId: 'group', position: { x: 360, y: 300 }, data: {} },
    ];

    const [group, near, inside] = normalizeEditorNodes(nodes, []);
    expect(group).toMatchObject({ width: 840, height: 700 });
    expect(near.position).toEqual({ x: 12, y: 79 });
    expect(inside).toBe(nodes[2]);
  });

  it('treats children of locked groups as locked', () => {
    const nodes: Node[] = [
      {
        id: 'group',
        type: 'group',
        position: { x: 0, y: 0 },
        data: { locked: true },
      },
      {
        id: 'child',
        type: 'io',
        position: { x: 24, y: 24 },
        parentId: 'group',
        extent: 'parent',
        data: {},
      },
    ];

    expect(isNodeLockedWithAncestors('group', nodes)).toBe(true);
    expect(isNodeLockedWithAncestors('child', nodes)).toBe(true);
  });

  it('arranges root nodes by the chain projected through group transit ports', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        type: 'io',
        position: { x: 1200, y: 520 },
        data: {},
      },
      {
        id: 'group',
        type: 'group',
        position: { x: 640, y: 480 },
        width: 640,
        height: 400,
        data: {
          groupInputs: [
            {
              id: 'port_in',
              label: 'Input 1',
              type: 'any',
              insideLinks: [{ nodeId: 'child', handleId: 'input' }],
              outsideLinks: [{ nodeId: 'source', handleId: 'result' }],
            },
          ],
          groupOutputs: [
            {
              id: 'port_out',
              label: 'Output 1',
              type: 'any',
              insideLinks: [{ nodeId: 'child', handleId: 'result' }],
              outsideLinks: [{ nodeId: 'output', handleId: 'input' }],
            },
          ],
        },
      },
      {
        id: 'child',
        type: 'aiV3',
        position: { x: 64, y: 112 },
        parentId: 'group',
        extent: 'parent',
        data: {},
      },
      {
        id: 'output',
        type: 'io',
        position: { x: 160, y: 1200 },
        data: {},
      },
    ];

    const edges = [
      {
        id: 'source-to-group',
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
      {
        id: 'child-to-group',
        source: 'child',
        sourceHandle: 'result',
        target: 'group',
        targetHandle: 'group-port:output:internal:port_out',
      },
      {
        id: 'group-to-output',
        source: 'group',
        sourceHandle: 'group-port:output:external:port_out',
        target: 'output',
        targetHandle: 'input',
      },
    ];

    const arranged = autoArrangeNodes(nodes, edges);
    const source = arranged.find((node) => node.id === 'source');
    const group = arranged.find((node) => node.id === 'group');
    const output = arranged.find((node) => node.id === 'output');

    expect(source && group && output).toBeTruthy();
    expect((source?.position.x || 0) < (group?.position.x || 0)).toBe(true);
    expect((group?.position.x || 0) < (output?.position.x || 0)).toBe(true);
  });
});
