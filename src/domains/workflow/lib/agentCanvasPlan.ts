import { useWorkflowStore } from './store';
import { createWorkflowGraphEditorActions } from './store/editorGraph';
import { getEffectiveNodeSize } from './groupLayout';
import { expandNodeActionIds, isNodeLockedWithAncestors } from './store/editorShared';

type Mode = 'chat' | 'image' | 'video';
type NodeMode = Mode | 'audio' | 'midjourney';
export type CanvasPlan = {
  operations: (
    | { kind: 'add'; ref: string; type: 'io' | 'aiV3'; label: string; text: string; mode?: Mode }
    | { kind: 'update'; nodeId: string; label?: string; text?: string }
    | { kind: 'connect' | 'disconnect'; source: string; target: string }
    | {
        kind: 'configure';
        nodeId: string;
        settings: {
          model?: string;
          mode?: NodeMode;
          prompt?: string;
          systemPrompt?: string;
          enableWebSearch?: boolean;
          ratio?: string;
          width?: number;
          height?: number;
          n?: number;
          imageResolution?: string;
          output_format?: string;
          duration?: number;
          voice?: string;
        };
      }
    | { kind: 'remove'; nodeId: string }
    | { kind: 'clear' }
    | { kind: 'disable'; nodeId: string; disabled: boolean }
    | { kind: 'move'; nodeId: string; x: number; y: number }
    | { kind: 'run' }
  )[];
};

export type CanvasPlanTarget = {
  documentId: string;
  workflowId: string;
  models: Partial<Record<Mode, string>>;
};

export function applyAgentCanvasPlan(plan: CanvasPlan, target: CanvasPlanTarget) {
  const original = useWorkflowStore.getState();
  if (original.activeDocumentId !== target.documentId || original.workflowId !== target.workflowId) {
    throw new Error('请切回提出方案时的画布。');
  }
  if (original.isExecuting || original.isHydratingWorkflow) throw new Error('请等画布当前操作结束后再应用。');

  let staged = original;
  const editor = createWorkflowGraphEditorActions(
    (patch) => {
      staged = { ...staged, ...(typeof patch === 'function' ? patch(staged) : patch) };
    },
    () => staged,
  );
  const refs = new Map<string, string>();
  const removedIds = new Set<string>();
  const startX = original.nodes.reduce(
    (right, node) => Math.max(right, node.position.x + getEffectiveNodeSize(node).width + 80),
    80,
  );
  const startY = original.nodes.length ? Math.min(...original.nodes.map((node) => node.position.y)) : 80;

  function editableNode(ref: string) {
    const id = refs.get(ref) ?? ref;
    const node = staged.nodes.find((item) => item.id === id);
    if (!node || (node.type !== 'io' && node.type !== 'aiV3')) throw new Error(`找不到可编辑节点「${ref}」。`);
    if (isNodeLockedWithAncestors(node.id, staged.nodes)) throw new Error(`节点「${ref}」已锁定。`);
    return node;
  }

  function removeNodes(ids: string[]) {
    const expanded = expandNodeActionIds(staged.nodes, ids);
    for (const id of expanded) {
      if (isNodeLockedWithAncestors(id, staged.nodes)) throw new Error(`节点「${id}」已锁定，无法删除。`);
    }
    editor.removeNodesWithoutReconnect(ids);
    for (const id of expanded) removedIds.add(id);
  }

  const shouldRun = plan.operations.at(-1)?.kind === 'run';
  if (plan.operations.slice(0, -1).some(({ kind }) => kind === 'run')) {
    throw new Error('运行必须是方案的最后一步。');
  }
  for (const operation of plan.operations) {
    switch (operation.kind) {
      case 'add': {
        if (refs.has(operation.ref) || staged.nodes.some(({ id }) => id === operation.ref)) {
          throw new Error(`节点引用「${operation.ref}」重复。`);
        }
        const mode = operation.mode ?? 'chat';
        const model = target.models[mode];
        if (
          operation.type === 'aiV3' &&
          (!model || !original.availableModels[mode].some(({ value }) => value === model))
        ) {
          throw new Error(
            `请先配置并选择${{ chat: '对话', image: '图像', video: '视频' }[mode]}模型，再让弧光重新提出方案。`,
          );
        }
        const data =
          operation.type === 'io'
            ? { label: operation.label, text: operation.text }
            : { label: operation.label, mode, model, [mode === 'chat' ? 'systemPrompt' : 'prompt']: operation.text };
        const id = editor.addNode(
          operation.type,
          { x: startX + (refs.size % 3) * 400, y: startY + Math.floor(refs.size / 3) * 360 },
          data,
        );
        refs.set(operation.ref, id);
        break;
      }
      case 'update': {
        const node = editableNode(operation.nodeId);
        const data: Record<string, unknown> = {};
        if (operation.label !== undefined) data.label = operation.label;
        if (operation.text !== undefined) {
          const key = node.type === 'io' ? 'text' : (node.data.mode || 'chat') === 'chat' ? 'systemPrompt' : 'prompt';
          data[key] = operation.text;
          // Earlier plans wrote plain text to the IO attachment field.
          if (node.type === 'io' && node.data.content === operation.text) data.content = [];
        }
        editor.updateNodeData(node.id, data);
        break;
      }
      case 'configure': {
        const node = editableNode(operation.nodeId);
        if (node.type !== 'aiV3') throw new Error('模型和生成参数只适用于 AI 能力 V3 节点。');
        const { model, mode, ...settings } = operation.settings;
        const categories = ['chat', 'image', 'video', 'audio', 'midjourney'] as const;
        const currentModel = typeof node.data.model === 'string' ? node.data.model : '';
        const modelMode = model
          ? categories.find((category) => original.availableModels[category].some(({ value }) => value === model))
          : undefined;
        if (model && !modelMode) throw new Error('所选模型已不可用，请重新选择。');
        if (mode && modelMode && mode !== modelMode) throw new Error('模型和节点模式不匹配。');
        const nextMode = mode ?? modelMode ?? (categories.find((category) => category === node.data.mode) || 'chat');
        const nextModel =
          model ||
          (original.availableModels[nextMode].some(
            ({ value, modelId }) => value === currentModel || modelId === currentModel,
          )
            ? currentModel
            : target.models[nextMode as Mode]);
        if ((model || mode) && !nextModel) throw new Error('请先为目标模式选择可用模型。');
        editor.updateNodeData(node.id, {
          ...settings,
          ...(model || mode ? { model: nextModel, mode: nextMode } : {}),
        });
        break;
      }
      case 'run':
        break;
      case 'clear':
        removeNodes(staged.nodes.map(({ id }) => id));
        break;
      case 'remove': {
        const id = refs.get(operation.nodeId) ?? operation.nodeId;
        if (removedIds.has(id)) break;
        if (!staged.nodes.some((node) => node.id === id)) throw new Error(`找不到要删除的节点「${id}」。`);
        removeNodes([id]);
        break;
      }
      case 'disable':
        editor.updateNodeData(editableNode(operation.nodeId).id, { disabled: operation.disabled });
        break;
      case 'move':
        editor.onNodesChange([
          {
            type: 'position',
            id: editableNode(operation.nodeId).id,
            position: { x: operation.x, y: operation.y },
          },
        ]);
        break;
      case 'disconnect': {
        const source = editableNode(operation.source);
        const targetNode = editableNode(operation.target);
        const edges = staged.edges.filter((edge) => edge.source === source.id && edge.target === targetNode.id);
        if (!edges.length) throw new Error('这两个节点之间没有连线。');
        for (const edge of edges) editor.removeEdge(edge.id);
        break;
      }
      case 'connect': {
        const source = editableNode(operation.source);
        const targetNode = editableNode(operation.target);
        if (source.id === targetNode.id) throw new Error('节点不能连接自身。');
        if (
          staged.edges.some(
            (edge) =>
              edge.source === source.id &&
              edge.target === targetNode.id &&
              edge.sourceHandle === 'result' &&
              edge.targetHandle === 'input',
          )
        )
          break;
        const count = staged.edges.length;
        editor.addEdge(source.id, 'result', targetNode.id, 'input');
        if (staged.edges.length === count)
          throw new Error(`无法连接「${operation.source}」和「${operation.target}」。`);
        break;
      }
    }
  }
  if (staged !== original)
    useWorkflowStore.setState({
      nodes: staged.nodes,
      edges: staged.edges,
      selectedNodeId: staged.selectedNodeId,
      nodeWarnings: staged.nodeWarnings,
      workflowWarningMessage: staged.workflowWarningMessage,
      nodeExecStatus: staged.nodeExecStatus,
      nodeExecutionTime: staged.nodeExecutionTime,
      nodeExecutionStartedAt: staged.nodeExecutionStartedAt,
      nodeExecutionActiveCounts: staged.nodeExecutionActiveCounts,
      nodeExecutionStartedCounts: staged.nodeExecutionStartedCounts,
      nodeExecutionCompletedCounts: staged.nodeExecutionCompletedCounts,
      nodeExecutionExpectedCounts: staged.nodeExecutionExpectedCounts,
      nodeErrors: staged.nodeErrors,
      nodeOutputs: staged.nodeOutputs,
      aiResultOutputs: staged.aiResultOutputs,
      executionLogs: staged.executionLogs,
      hasUnsavedChanges: true,
    });
  return shouldRun;
}
