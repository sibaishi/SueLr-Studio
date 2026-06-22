import {
  collectDescendantIds,
  expandNodeIdsWithDescendants,
  getAbsoluteNodePosition,
} from '@/domains/workflow/lib/graphHierarchy';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

const nodes = [
  { id: 'root', position: { x: 100, y: 200 }, data: {} },
  { id: 'group', parentId: 'root', position: { x: 20, y: 30 }, data: {} },
  { id: 'child', parentId: 'group', position: { x: 4, y: 5 }, data: {} },
  { id: 'sibling', position: { x: 0, y: 0 }, data: {} },
] as Node[];

describe('workflow graph hierarchy', () => {
  it('resolves nested positions in canvas coordinates', () => {
    expect(getAbsoluteNodePosition('child', new Map(nodes.map((node) => [node.id, node])))).toEqual({
      x: 124,
      y: 235,
    });
  });

  it('collects descendants without including the root', () => {
    expect([...collectDescendantIds(nodes, ['root'])]).toEqual(['group', 'child']);
  });

  it('expands valid action roots and removes duplicates and unknown ids', () => {
    expect(expandNodeIdsWithDescendants(nodes, ['root', 'root', 'missing'])).toEqual(['root', 'group', 'child']);
  });
});
