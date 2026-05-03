import { describe, expect, it } from 'vitest';
import { getNodeDefaultSize } from '@/features/workflow/lib/constants';
import { normalizeMergeNodeSizes } from '@/features/workflow/lib/store/editorShared';

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
});
