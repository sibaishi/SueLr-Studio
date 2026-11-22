import type { GenerationRecord } from '@/shared/types/generation';
import { fileRawStore } from '../components/nodes/io/fileRawStore';
import { generationParameterPatch } from './generationReuse';
import { useWorkflowStore } from './store';
import { isNodeLockedWithAncestors } from './store/editorShared';

function insertionPosition(count: number) {
  return { x: 96 + (count % 6) * 32, y: 96 + Math.floor(count / 6) * 32 };
}

export function reuseGenerationParameters(record: GenerationRecord): string {
  const state = useWorkflowStore.getState();
  const selected = state.nodes.filter((node) => node.selected && node.type === 'ai');
  if (selected.length > 1) throw new Error('请只选中一个 AI 节点，再复用参数。');
  const target = selected[0];
  if (target && isNodeLockedWithAncestors(target.id, state.nodes)) throw new Error('选中的 AI 节点已锁定，请先解锁。');
  const model = record.parameters.model;
  if (!model || !state.availableModels.all.some((item) => item.value === model || item.modelId === model)) {
    throw new Error('当次使用的模型尚未启用，请先在设置中启用对应模型，再复用参数。');
  }
  const patch = generationParameterPatch(record);
  if (target) {
    state.updateNodeData(target.id, patch);
    return '已复用到选中的 AI 节点；提示词和参考保持原样。';
  }
  const id = state.addNode('ai', insertionPosition(state.nodes.length), patch);
  state.selectNode(id);
  return '已新建 AI 节点并复用参数，请补充提示词和参考。';
}

export function backfillGenerationReferences(record: GenerationRecord): string {
  if (!record.references.length) throw new Error('这份结果没有使用参考素材。');
  const state = useWorkflowStore.getState();
  const ids = record.references.map(() => fileRawStore.reserveId());
  const id = state.addNode('io', insertionPosition(state.nodes.length), {
    text: '',
    content: record.references.map((reference) => reference.url),
    _fileIds: ids,
    _fileOrder: ids,
    _fileKinds: record.references.map((reference) => reference.kind),
    _fileNames: record.references.map(
      (reference, index) => `${reference.role === 'mask' ? '生成蒙版' : '生成参考'} ${index + 1}`,
    ),
  });
  state.selectNode(id);
  return `已将 ${ids.length} 份当次参考添加到新的 IO 节点。`;
}
