import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiConfigPayload, resolveStoredApiKey } from '@/shared/providers/model-routing';

const capabilityGenerateImage = vi.fn();
const capabilitySubmitVideoGeneration = vi.fn();

vi.mock('@/shared/api/capabilities', () => ({
  capabilityChatCompletion: vi.fn(),
  capabilityChatCompletionStream: vi.fn(),
  capabilityGenerateImage,
  capabilitySubmitVideoGeneration,
}));

describe('provider model routing', () => {
  beforeEach(() => {
    capabilityGenerateImage.mockReset();
    capabilitySubmitVideoGeneration.mockReset();
  });

  it('uses stored backend secrets when redacted configs are rehydrated', () => {
    const payload = buildApiConfigPayload(
      {
        id: 'stored-config',
        name: 'Stored',
        base: 'https://provider.example/v1',
        apiKey: '',
        apiKeySet: true,
        models: [],
      },
      {
        apiKey: '',
        baseUrl: '',
      },
    );

    expect(payload).toMatchObject({
      configId: 'stored-config',
      apiKey: 'use-stored',
      baseUrl: 'https://provider.example/v1',
    });
  });

  it('keeps plaintext edits and falls back only when no stored secret exists', () => {
    expect(resolveStoredApiKey({ apiKey: 'sk-live', apiKeySet: true }, '')).toBe('sk-live');
    expect(resolveStoredApiKey({ apiKey: '', apiKeySet: false }, 'sk-fallback')).toBe('sk-fallback');
  });

  it('does not overwrite an explicit stored-secret marker inside provider wrappers', async () => {
    const { createProvider } = await import('@/shared/providers/generic');
    capabilityGenerateImage.mockResolvedValue({ images: [] });
    capabilitySubmitVideoGeneration.mockResolvedValue({ mode: 'poll', taskId: 'task-1' });

    const provider = createProvider('', '');

    await provider.generateImage({
      model: 'image-model',
      prompt: 'test',
      apiConfig: {
        configId: 'stored-config',
        apiKey: 'use-stored',
        baseUrl: 'https://provider.example/v1',
      },
    });
    await provider.submitVideoGeneration({
      model: 'video-model',
      prompt: 'test',
      apiConfig: {
        configId: 'stored-config',
        apiKey: 'use-stored',
        baseUrl: 'https://provider.example/v1',
      },
    });

    expect(capabilityGenerateImage.mock.calls[0][0].apiConfig).toMatchObject({
      configId: 'stored-config',
      apiKey: 'use-stored',
      baseUrl: 'https://provider.example/v1',
    });
    expect(capabilitySubmitVideoGeneration.mock.calls[0][0].apiConfig).toMatchObject({
      configId: 'stored-config',
      apiKey: 'use-stored',
      baseUrl: 'https://provider.example/v1',
    });
  });
});
