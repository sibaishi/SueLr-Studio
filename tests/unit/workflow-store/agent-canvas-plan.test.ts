import { expect, it } from 'vitest';
import { applyAgentCanvasPlan } from '@/domains/workflow/lib/agentCanvasPlan';
import { useWorkflowStore } from '@/domains/workflow/lib/store';

it('writes IO prompts into the text field and preserves attached files', () => {
  const original = useWorkflowStore.getState();
  const target = { documentId: 'test-doc', workflowId: 'test-workflow', models: {} };
  const files = ['/api/files/reference.png'];
  useWorkflowStore.setState({
    activeDocumentId: target.documentId,
    workflowId: target.workflowId,
    isExecuting: false,
    isHydratingWorkflow: false,
    nodes: [{ id: 'prompt', type: 'io', position: { x: 0, y: 0 }, data: { text: '旧提示词', content: files } }],
    edges: [],
  });

  try {
    applyAgentCanvasPlan(
      {
        operations: [
          { kind: 'update', nodeId: 'prompt', text: '新提示词' },
          { kind: 'add', ref: 'second', type: 'io', label: '新增输入', text: '另一条提示词' },
        ],
      },
      target,
    );
    const [updated, added] = useWorkflowStore.getState().nodes;
    expect(updated.data).toMatchObject({ text: '新提示词', _ownText: '新提示词', content: files });
    expect(added.data).toMatchObject({ label: '新增输入', text: '另一条提示词' });
    expect(added.data.content).toBeUndefined();

    useWorkflowStore.setState({ nodes: [{ ...updated, data: { text: '旧提示词', content: '新提示词' } }] });
    applyAgentCanvasPlan({ operations: [{ kind: 'update', nodeId: 'prompt', text: '新提示词' }] }, target);
    expect(useWorkflowStore.getState().nodes[0].data).toMatchObject({ text: '新提示词', content: [] });
  } finally {
    useWorkflowStore.setState(original, true);
  }
});

it('configures a node with an enabled model and rejects mismatched modes atomically', () => {
  const original = useWorkflowStore.getState();
  const target = { documentId: 'test-doc', workflowId: 'test-workflow', models: {} };
  const model = 'channel::image';
  useWorkflowStore.setState({
    activeDocumentId: target.documentId,
    workflowId: target.workflowId,
    isExecuting: false,
    isHydratingWorkflow: false,
    availableModels: { ...original.availableModels, image: [{ value: model, modelId: 'image', label: 'Image' }] },
    nodes: [{ id: 'generate', type: 'aiV3', position: { x: 0, y: 0 }, data: { mode: 'chat' } }],
    edges: [],
  });
  try {
    applyAgentCanvasPlan(
      {
        operations: [{ kind: 'configure', nodeId: 'generate', settings: { model, ratio: '16:9', n: 2 } }],
      },
      target,
    );
    const state = useWorkflowStore.getState();
    expect(state.nodes[0].data).toMatchObject({ model, mode: 'image', ratio: '16:9', n: 2 });
    expect(() =>
      applyAgentCanvasPlan(
        {
          operations: [{ kind: 'configure', nodeId: 'generate', settings: { model, mode: 'video' } }],
        },
        target,
      ),
    ).toThrow('模型和节点模式不匹配');
    expect(useWorkflowStore.getState()).toBe(state);
  } finally {
    useWorkflowStore.setState(original, true);
  }
});

it('deletes groups and their explicitly listed children, and clears only unlocked canvases', () => {
  const original = useWorkflowStore.getState();
  const target = { documentId: 'test-doc', workflowId: 'test-workflow', models: {} };
  const nodes = [
    { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: {} },
    { id: 'prompt', type: 'io', parentId: 'group', position: { x: 20, y: 60 }, data: {} },
  ];
  useWorkflowStore.setState({
    activeDocumentId: target.documentId,
    workflowId: target.workflowId,
    isExecuting: false,
    isHydratingWorkflow: false,
    nodes,
    edges: [],
  });
  try {
    applyAgentCanvasPlan(
      {
        operations: [
          { kind: 'remove', nodeId: 'group' },
          { kind: 'remove', nodeId: 'prompt' },
        ],
      },
      target,
    );
    expect(useWorkflowStore.getState().nodes).toEqual([]);
    useWorkflowStore.setState({ nodes: [nodes[0], { ...nodes[1], data: { locked: true } }] });
    const locked = useWorkflowStore.getState();
    expect(() => applyAgentCanvasPlan({ operations: [{ kind: 'clear' }] }, target)).toThrow('已锁定');
    expect(useWorkflowStore.getState()).toBe(locked);
    useWorkflowStore.setState({ nodes });
    applyAgentCanvasPlan({ operations: [{ kind: 'clear' }] }, target);
    expect(useWorkflowStore.getState().nodes).toEqual([]);
  } finally {
    useWorkflowStore.setState(original, true);
  }
});
