import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { projectWorkflowToExecutionGraph } from '@/features/workflow/lib/executionGraph';

describe('execution graph projection', () => {
  it('flattens group transit ports into direct executable edges', () => {
    const nodes: Node[] = [
      { id: 'source', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'group',
        type: 'group',
        position: { x: 56, y: 56 },
        data: {
          groupInputs: [
            {
              id: 'port_in',
              label: 'Input 1',
              type: 'string',
              binding: { nodeId: 'child', handleId: 'prompt' },
            },
          ],
          groupOutputs: [
            {
              id: 'port_out',
              label: 'Output 1',
              type: 'string',
              binding: { nodeId: 'child', handleId: 'response' },
            },
          ],
        },
      },
      {
        id: 'child',
        type: 'aiChat',
        position: { x: 84, y: 112 },
        parentId: 'group',
        extent: 'parent',
        data: {},
      },
      { id: 'output', type: 'output', position: { x: 420, y: 84 }, data: {} },
    ];

    const edges = [
      {
        id: 'edge_external_in',
        source: 'source',
        sourceHandle: 'text',
        target: 'group',
        targetHandle: 'group-port:input:external:port_in',
      },
      {
        id: 'edge_internal_in',
        source: 'group',
        sourceHandle: 'group-port:input:internal:port_in',
        target: 'child',
        targetHandle: 'prompt',
      },
      {
        id: 'edge_internal_out',
        source: 'child',
        sourceHandle: 'response',
        target: 'group',
        targetHandle: 'group-port:output:internal:port_out',
      },
      {
        id: 'edge_external_out',
        source: 'group',
        sourceHandle: 'group-port:output:external:port_out',
        target: 'output',
        targetHandle: 'input',
      },
    ];

    const projected = projectWorkflowToExecutionGraph(nodes, edges);

    expect(projected.nodes.map((node) => node.id)).toEqual(['source', 'child', 'output']);
    expect(projected.edges).toEqual([
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'text',
        target: 'child',
        targetHandle: 'prompt',
      }),
      expect.objectContaining({
        source: 'child',
        sourceHandle: 'response',
        target: 'output',
        targetHandle: 'input',
      }),
    ]);
  });

  it('recursively resolves nested group ports down to the real bound node handle', () => {
    const nodes: Node[] = [
      { id: 'source', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'outer_group',
        type: 'group',
        position: { x: 56, y: 56 },
        data: {
          groupInputs: [
            {
              id: 'outer_in',
              label: 'Input 1',
              type: 'string',
              binding: { nodeId: 'inner_group', handleId: 'group-port:input:external:inner_in' },
            },
          ],
        },
      },
      {
        id: 'inner_group',
        type: 'group',
        position: { x: 84, y: 84 },
        parentId: 'outer_group',
        extent: 'parent',
        data: {
          groupInputs: [
            {
              id: 'inner_in',
              label: 'Input 1',
              type: 'string',
              binding: { nodeId: 'inner_child', handleId: 'prompt' },
            },
          ],
        },
      },
      {
        id: 'inner_child',
        type: 'aiChat',
        position: { x: 112, y: 140 },
        parentId: 'inner_group',
        extent: 'parent',
        data: {},
      },
    ];

    const edges = [
      {
        id: 'edge_nested_external',
        source: 'source',
        sourceHandle: 'text',
        target: 'outer_group',
        targetHandle: 'group-port:input:external:outer_in',
      },
    ];

    const projected = projectWorkflowToExecutionGraph(nodes, edges);

    expect(projected.edges).toEqual([
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'text',
        target: 'inner_child',
        targetHandle: 'prompt',
      }),
    ]);
  });
});
