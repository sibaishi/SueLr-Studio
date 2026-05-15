import { describe, expect, it } from 'vitest';
import { createImportedProjectModels } from '@/features/workflow/lib/projectModels';

describe('createImportedProjectModels', () => {
  it('keeps discovered model categories when importing into the project model library', () => {
    const models = createImportedProjectModels([
      { id: 'chat-model', cat: 'chat' },
      { id: 'image-model', cat: 'image' },
      { id: 'video-model', cat: 'video' },
    ], []);

    expect(models.map((model) => ({
      modelId: model.modelId,
      type: model.type,
      endpointCategory: model.endpointCategory,
      configured: model.configured,
    }))).toEqual([
      { modelId: 'chat-model', type: 'chat', endpointCategory: 'chat', configured: true },
      { modelId: 'image-model', type: 'image', endpointCategory: 'image', configured: true },
      { modelId: 'video-model', type: 'video', endpointCategory: 'video', configured: true },
    ]);
  });

  it('keeps legacy string imports unconfigured until the user chooses a type', () => {
    const models = createImportedProjectModels(['unknown-model'], []);

    expect(models[0]).toMatchObject({
      modelId: 'unknown-model',
      type: '',
      endpointCategory: '',
      configured: false,
    });
  });
});
