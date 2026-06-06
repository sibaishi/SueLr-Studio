// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImages } from '../src/engine/helpers/imageGeneration.ts';

test('generateImages falls back from resolution-suffixed Gemini model to base model when distributor is unavailable', async () => {
  const payloads = [];
  const progress = [];

  globalThis.fetch = async (url, options = {}) => {
    payloads.push({ url: String(url), options });
    const body = options.body ? JSON.parse(String(options.body)) : {};
    if (String(url).includes('gemini-3.1-flash-image-preview-1k:generateContent')) {
      return new Response(
        JSON.stringify({ error: { message: '分组 VIP 下模型 gemini-3.1-flash-image-preview-1k 无可用渠道（distributor）' } }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (String(url).includes('gemini-3.1-flash-image-preview:generateContent')) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: Buffer.from('fallback-image').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
          requestBodyEcho: body,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  const result = await generateImages(
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
          id: 'gemini-base',
          modelId: 'gemini-3.1-flash-image-preview',
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

  assert.equal(payloads.length, 2);
  assert.match(payloads[0].url, /gemini-3\.1-flash-image-preview-1k:generateContent/);
  assert.match(payloads[1].url, /gemini-3\.1-flash-image-preview:generateContent/);
  assert.equal(Array.isArray(result.images), true);
  assert.equal(result.images.length, 1);
  assert.match(String(result.images[0]), /^data:image\/png;base64,/);
  assert.equal(result.request.model, 'gemini-3.1-flash-image-preview-1k');
  assert.equal(progress.some((message) => message.includes('已回退到基础模型 gemini-3.1-flash-image-preview 重试一次')), true);
});
