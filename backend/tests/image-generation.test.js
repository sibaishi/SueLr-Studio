import test from 'node:test';
import assert from 'node:assert/strict';

import { generateImages } from '../engine/helpers/imageGeneration.js';

function createRuntimeConfig(overrides = {}) {
  return {
    apiKey: 'demo-key',
    baseUrl: 'https://example.com',
    providerConfig: {
      authType: 'bearer',
      imageEndpoint: '/v1/images/generations',
      imageEditEndpoint: '/v1/images/edits',
      ...overrides.providerConfig,
    },
    projectModels: [
      {
        id: 'demo-image-model',
        modelId: 'demo-image-model',
        type: 'image',
        enabled: true,
        endpointMode: 'category',
        endpointCategory: 'image',
      },
    ],
    ...overrides,
  };
}

test('generateImages retries connect timeout for image generation requests', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const progress = [];
  let attempts = 0;

  globalThis.setTimeout = (fn, _ms, ...args) => {
    fn(...args);
    return 0;
  };

  globalThis.fetch = async (_url, options = {}) => {
    attempts += 1;
    assert.equal(options.method, 'POST');
    if (attempts < 3) {
      const error = new Error('fetch failed');
      error.cause = {
        code: 'UND_ERR_CONNECT_TIMEOUT',
        message: 'Connect Timeout Error',
      };
      throw error;
    }

    return new Response(JSON.stringify({
      data: [
        { b64_json: 'YWJj' },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await generateImages({
      model: 'demo-image-model',
      prompt: 'draw a mountain',
    }, createRuntimeConfig(), (message) => {
      progress.push(message);
    });

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(attempts, 3);
    assert.match(progress.join('\n'), /重试第 2\/3 次/);
    assert.match(progress.join('\n'), /重试第 3\/3 次/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('generateImages does not retry non-retryable image request errors', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    const error = new Error('fetch failed');
    error.cause = {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND',
    };
    throw error;
  };

  try {
    await assert.rejects(
      generateImages({
        model: 'demo-image-model',
        prompt: 'draw a lake',
      }, createRuntimeConfig()),
      /ENOTFOUND/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages uses chat payload instead of form-data when chat endpoint has reference images', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,YWJj' },
              },
            ],
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await generateImages({
      model: 'demo-image-model',
      prompt: 'turn this into a render',
      image: ['data:image/png;base64,QUJD'],
      quality: 'high',
      width: 2048,
      height: 2048,
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'demo-image-model',
          modelId: 'demo-image-model',
          type: 'image',
          enabled: true,
          endpointMode: 'custom',
          customEndpoint: '/v1/chat/completions',
        },
      ],
    }));

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/v1/chat/completions');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body instanceof FormData, false);

    const payload = JSON.parse(String(requests[0].body));
    assert.equal(payload.model, 'demo-image-model');
    assert.equal(payload.quality, 'high');
    assert.equal(payload.size, '2048x2048');
    assert.equal(payload.messages?.[0]?.role, 'user');
    assert.ok(Array.isArray(payload.messages?.[0]?.content));
    assert.equal(payload.messages[0].content[0].type, 'text');
    assert.match(payload.messages[0].content[0].text, /请以以下提示词帮我生成图片/);
    assert.equal(payload.messages[0].content[1].type, 'image_url');
    assert.equal(payload.messages[0].content[1].image_url.url, 'data:image/png;base64,QUJD');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
