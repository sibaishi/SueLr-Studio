// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImages } from '../src/engine/helpers/imageGeneration.ts';

test('generateImages keeps model name as-is without suffix resolution when distributor is unavailable', async () => {
  const payloads = [];
  const progress = [];

  globalThis.fetch = async (url, _options = {}) => {
    payloads.push(String(url));
    return new Response(
      JSON.stringify({ error: { message: '分组 VIP 下模型 gemini-3.1-flash-image-preview-1k 无可用渠道（distributor）' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    await generateImages(
      {
        prompt: '一只猫的 1:1 实拍照片',
        model: 'gemini-3.1-flash-image-preview-1k',
        resolution: '1k',
        n: 1,
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://example.test',
        providerConfig: {},
        persistGeneratedOutputs: false,
        projectModels: [
          {
            id: 'gemini-3.1-flash-image-preview-1k',
            modelId: 'gemini-3.1-flash-image-preview-1k',
            enabled: true,
            type: 'image',
            endpointMode: 'category',
            endpointCategory: 'gemini-generate-content',
            customEndpoint: '',
            configured: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        scope: { userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' },
      },
      (message) => progress.push(message),
    );
    assert.fail('Expected generateImages to throw');
  } catch (error) {
    assert.match(String(error?.message || error), /无可用渠道/);
  }

  // Only one request — no suffix-stripping fallback
  assert.equal(payloads.length, 1);
  assert.match(payloads[0], /gemini-3\.1-flash-image-preview-1k:generateContent/);
  // Model name is kept as-is in the URL (no suffix stripping)
  assert.equal(progress.some((message) => message.includes('已回退到基础模型')), false);
});
