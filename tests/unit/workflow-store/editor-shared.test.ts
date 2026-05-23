import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { autoArrangeNodes, isNodeLockedWithAncestors, normalizeMergeNodeSizes } from '@/domains/workflow/lib/store/editorShared';

describe('workflow store shared editor helpers', () => {
  it('grows merge nodes to match the highest connected input handle', () => {
    const minimumSize = getNodeDefaultSize('textMerge', 4);
    const nodes = [
      {
        id: 'merge',
        type: 'textMerge',
        position: { x: 0, y: 0 },
        width: minimumSize.w - 56,
        height: minimumSize.h - 56,
        data: { inputCount: 1 },
      },
    ];
    const edges = [
      { id: 'edge0', source: 'source0', sourceHandle: 'output', target: 'merge', targetHandle: 'item0' },
      { id: 'edge3', source: 'source3', sourceHandle: 'output', target: 'merge', targetHandle: 'item3' },
    ];

    const [mergeNode] = normalizeMergeNodeSizes(nodes, edges);

    expect(mergeNode?.data.inputCount).toBe(4);
    expect(mergeNode?.width).toBe(minimumSize.w);
    expect(mergeNode?.height).toBe(minimumSize.h);
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
        type: 'textInput',
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
        type: 'textInput',
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
              outsideLinks: [{ nodeId: 'output', handleId: 'content' }],
            },
          ],
        },
      },
      {
        id: 'child',
        type: 'aiChat',
        position: { x: 64, y: 112 },
        parentId: 'group',
        extent: 'parent',
        data: {},
      },
      {
        id: 'output',
        type: 'outputDisplay',
        position: { x: 160, y: 1200 },
        data: {},
      },
    ];

    const edges = [
      {
        id: 'source-to-group',
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
        id: 'group-to-output',
        source: 'group',
        sourceHandle: 'group-port:output:external:port_out',
        target: 'output',
        targetHandle: 'content',
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
