import type { GenerationRecord } from '@/shared/types/generation';
import { describe, expect, it, vi } from 'vitest';
import { generationParameterPatch } from '@/domains/workflow/lib/generationReuse';
const state = vi.hoisted(() => ({
  nodes: [] as any[],
  availableModels: { all: [{ value: 'channel::image' }] },
  updateNodeData: vi.fn(),
  addNode: vi.fn(() => 'new-node'),
  selectNode: vi.fn(),
}));
vi.mock('@/domains/workflow/lib/store', () => ({ useWorkflowStore: { getState: () => state } }));
import { backfillGenerationReferences, reuseGenerationParameters } from '@/domains/workflow/lib/generationActions';
const record: GenerationRecord = {
  version: 1,
  runId: 'run',
  workflowId: 'workflow',
  nodeId: 'ai',
  createdAt: 1,
  prompt: '当次提示词',
  references: [{ url: '/api/uploads/example.png', kind: 'image' }],
  parameters: { model: 'channel::image', mode: 'image', ratio: '4:3', n: 1 },
};
describe('generation reuse', () => {
  it('only applies allowed parameters and clears stale options without copying prompt, references or credentials', () => {
    const patch = generationParameterPatch({
      ...record,
      parameters: { ...record.parameters, prompt: 'wrong', apiKey: 'secret', duration: Number.NaN },
    });
    expect(patch).toMatchObject({ model: 'channel::image', ratio: '4:3', n: 1 });
    expect(patch).not.toHaveProperty('prompt');
    expect(patch).not.toHaveProperty('apiKey');
    expect(patch).toHaveProperty('duration', undefined);
    expect(patch).toHaveProperty('resolution', undefined);
  });
  it('reuses into one selected AI node and refuses disabled models or locked nodes', () => {
    state.nodes = [{ id: 'selected', type: 'ai', selected: true, data: {} }];
    expect(reuseGenerationParameters(record)).toContain('选中的 AI');
    expect(state.updateNodeData).toHaveBeenCalledWith('selected', generationParameterPatch(record));
    expect(() => reuseGenerationParameters({ ...record, parameters: { model: 'disabled' } })).toThrow('尚未启用');
    state.nodes[0].data.locked = true;
    expect(() => reuseGenerationParameters(record)).toThrow('锁定');
    state.nodes = [];
  });
  it('creates an AI node when none is selected and backfills references as an independent IO node', () => {
    state.nodes = [];
    reuseGenerationParameters(record);
    expect(state.addNode).toHaveBeenCalledWith('ai', { x: 96, y: 96 }, generationParameterPatch(record));
    backfillGenerationReferences(record);
    expect(state.addNode).toHaveBeenLastCalledWith(
      'io',
      { x: 96, y: 96 },
      expect.objectContaining({ content: ['/api/uploads/example.png'], _fileKinds: ['image'] }),
    );
    expect(() => backfillGenerationReferences({ ...record, references: [] })).toThrow('没有使用参考');
  });
});
