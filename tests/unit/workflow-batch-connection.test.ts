import { describe, expect, it } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import {
  BATCH_OUTPUT_ID,
  batchOutputNode,
  planBatchConnection,
} from '@/domains/workflow/components/flowBatchConnection';
import { createWorkflowGraphEditorActions } from '@/domains/workflow/lib/store/editorGraph';
import { createWorkflowStoreHarness } from './workflow-store/testHarness';

const nodes: Node[] = [
  { id: 'a', type: 'io', selected: true, position: { x: 0, y: 0 }, data: {} },
  { id: 'b', type: 'io', selected: true, position: { x: 0, y: 320 }, data: {} },
  { id: 'target', type: 'ai', position: { x: 640, y: 0 }, data: {} },
];
describe('多选总输出', () => {
  it('生成普通连线、保留已有输入、重复连接不产生副本，撤销选择后临时端口消失', () => {
    const snapshot = structuredClone(nodes);
    const existing: Edge = {
      id: 'existing',
      source: 'other',
      sourceHandle: 'result',
      target: 'target',
      targetHandle: 'input',
    };
    const harness = createWorkflowStoreHarness({ nodes: structuredClone(nodes), edges: [existing] });
    const actions = createWorkflowGraphEditorActions(harness.set, harness.get);
    harness.attachActions(actions);
    for (const edge of planBatchConnection(nodes, [existing], 'target', 'input')) {
      actions.addEdge(edge.source, edge.sourceHandle!, edge.target, edge.targetHandle!);
    }
    expect(harness.getState().edges.map((edge) => edge.source)).toEqual(['other', 'a', 'b']);
    expect(planBatchConnection(nodes, harness.getState().edges, 'target', 'input')).toEqual([]);
    expect(batchOutputNode(nodes)?.id).toBe(BATCH_OUTPUT_ID);
    expect(harness.getState().nodes.some((node) => node.id === BATCH_OUTPUT_ID)).toBe(false);
    expect(batchOutputNode(nodes.map((node) => ({ ...node, selected: false })))).toBeNull();
    expect(nodes).toEqual(snapshot);
  });
  it('整体拒绝自连、成环、锁定节点及无效端口，不产生部分连线', () => {
    expect(planBatchConnection(nodes, [], 'a', 'input')).toEqual([]);
    expect(planBatchConnection(nodes, [{ id: 'cycle', source: 'target', target: 'b' }], 'target', 'input')).toEqual([]);
    expect(
      planBatchConnection(
        nodes.map((node) => (node.id === 'b' ? { ...node, data: { locked: true } } : node)),
        [],
        'target',
        'input',
      ),
    ).toEqual([]);
    expect(planBatchConnection(nodes, [], 'target', 'missing')).toEqual([]);
  });
  it('按父分组绝对位置放置总输出，隐藏和分组本身不作为来源', () => {
    const grouped: Node[] = [
      { id: 'group', type: 'group', selected: true, position: { x: 500, y: 100 }, data: {} },
      ...nodes.slice(0, 2).map((node) => ({ ...node, parentId: 'group' })),
    ];
    expect(batchOutputNode(grouped)?.position).toEqual({ x: 476, y: 76 });
    expect(batchOutputNode(grouped)?.handles?.[0]).toMatchObject({ x: 282, y: 298, type: 'source' });
    expect(planBatchConnection([...grouped, nodes[2]], [], 'target', 'input').map((edge) => edge.source)).toEqual([
      'a',
      'b',
    ]);
    expect(batchOutputNode(grouped.map((node) => (node.id === 'b' ? { ...node, hidden: true } : node)))).toBeNull();
  });
  it('新建节点改变选中态后仍按拖线起点快照连接全部来源', () => {
    const afterCreation = nodes.map((node) => ({ ...node, selected: node.id === 'target' }));
    expect(planBatchConnection(afterCreation, [], 'target', 'input', ['a', 'b']).map((edge) => edge.source)).toEqual([
      'a',
      'b',
    ]);
    expect(
      planBatchConnection(
        afterCreation.filter((node) => node.id !== 'b'),
        [],
        'target',
        'input',
        ['a', 'b'],
      ),
    ).toEqual([]);
  });
});
