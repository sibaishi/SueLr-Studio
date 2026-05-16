import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeVideoGeneration, pollVideoTask, submitVideoGeneration } from '../src/platform/ai/video-service.js';
import { ensureStorageDirectories, STORAGE_PATHS } from '../src/platform/storage/index.js';

function withTempStorage() {
  const previous = process.env.APP_CONFIG_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-video-service-'));
  process.env.APP_CONFIG_DIR = root;
  ensureStorageDirectories();
  return () => {
    if (previous === undefined) {
      delete process.env.APP_CONFIG_DIR;
    } else {
      process.env.APP_CONFIG_DIR = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}

function createRuntime(overrides = {}) {
  return {
    apiKey: 'demo-key',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    providerConfig: {
      authType: 'bearer',
      videoEndpoint: '/v1/video/generations',
      ...overrides.providerConfig,
    },
    projectModels: [
      {
        id: 'doubao-seedance-2-0-260128',
        modelId: 'doubao-seedance-2-0-260128',
        type: 'video',
        enabled: true,
        endpointMode: 'category',
        endpointCategory: 'video',
        configured: true,
      },
    ],
    ...overrides,
  };
}

test('submitVideoGeneration uses Ark contents generation tasks endpoint and payload', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody = null;
  const progress = [];

  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(options.body));

    return new Response(JSON.stringify({
      id: 'cgt-test-123',
      object: 'content_generation.task',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const runtime = createRuntime();
    const result = await submitVideoGeneration({
      ...runtime,
      model: 'doubao - seedance - 2 - 0 - 260128',
      prompt: 'a cinematic sunrise',
      duration: '10',
      aspect_ratio: '16:9',
      resolution: '720p',
      image_url: 'data:image/png;base64,YWJj',
      sendProgress: (message) => progress.push(message),
    });

    assert.equal(requestUrl, 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks');
    assert.equal(result.mode, 'poll');
    assert.equal(result.taskId, 'cgt-test-123');
    assert.equal(result.endpoint, '/contents/generations/tasks');
    assert.match(progress.join('\n'), /taskId=cgt-test-123/);
    assert.equal(requestBody.model, 'doubao-seedance-2-0-260128');
    assert.equal(requestBody.prompt, undefined);
    assert.equal(requestBody.aspect_ratio, undefined);
    assert.equal(requestBody.ratio, '16:9');
    assert.equal(requestBody.duration, 10);
    assert.equal(typeof requestBody.duration, 'number');
    assert.equal(requestBody.resolution, '720p');
    assert.deepEqual(requestBody.content, [
      { type: 'text', text: 'a cinematic sunrise' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' }, role: 'reference_image' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pollVideoTask uses Ark task status endpoint even when provider config has legacy video endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';

  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({
      status: 'succeeded',
      content: {
        video_url: 'https://example.com/result.mp4',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const runtime = createRuntime();
    const result = await pollVideoTask({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      providerConfig: runtime.providerConfig,
      taskId: 'cgt-test-123',
    });

    assert.equal(requestUrl, 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-test-123');
    assert.equal(result.status, 'succeeded');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitVideoGeneration omits image role for Seedance 1.0 first-frame i2v', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ id: 'cgt-test-i2v' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const runtime = createRuntime({
      projectModels: [
        {
          id: 'doubao-seedance-1-0-lite-i2v-250428',
          modelId: 'doubao-seedance-1-0-lite-i2v-250428',
          type: 'video',
          enabled: true,
          endpointMode: 'custom',
          customEndpoint: '/contents/generations/tasks',
          configured: true,
        },
      ],
    });
    await submitVideoGeneration({
      ...runtime,
      model: 'doubao-seedance-1-0-lite-i2v-250428',
      prompt: 'a running cat',
      duration: 5,
      aspect_ratio: '16:9',
      image_url: 'data:image/jpeg;base64,YWJj',
    });

    assert.deepEqual(requestBody.content, [
      { type: 'text', text: 'a running cat' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitVideoGeneration preserves automatic Seedance duration sentinel', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ id: 'cgt-test-auto-duration' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const runtime = createRuntime();
    await submitVideoGeneration({
      ...runtime,
      model: 'doubao-seedance-2-0-260128',
      prompt: 'a cinematic sunrise',
      duration: -1,
      aspect_ratio: '16:9',
    });

    assert.equal(requestBody.duration, -1);
    assert.equal(typeof requestBody.duration, 'number');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeVideoGeneration stores synchronous video results under generated videos directory', async () => {
  const cleanupStorage = withTempStorage();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    video_url: 'data:video/mp4;base64,QUJD',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const runtime = createRuntime({
      baseUrl: 'https://example.com',
      providerConfig: {
        authType: 'bearer',
        videoEndpoint: '/v1/video/generations',
      },
    });

    const result = await executeVideoGeneration({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'a cinematic sunrise',
      duration: 5,
      aspect_ratio: '16:9',
      resolution: '720p',
    }, runtime);

    assert.match(result.video, /^\/api\/outputs\/videos\/.+\.mp4$/);
    const relativePath = result.video.replace('/api/outputs/', '');
    assert.equal(fs.readFileSync(path.join(STORAGE_PATHS.generatedDir, relativePath), 'utf8'), 'ABC');
  } finally {
    globalThis.fetch = originalFetch;
    cleanupStorage();
  }
});

test('executeVideoGeneration can leave generated video data unpersisted for workflow output nodes', async () => {
  const cleanupStorage = withTempStorage();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    video_url: 'data:video/mp4;base64,QUJD',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const runtime = createRuntime({
      baseUrl: 'https://example.com',
      providerConfig: {
        authType: 'bearer',
        videoEndpoint: '/v1/video/generations',
      },
      persistGeneratedOutputs: false,
    });

    const result = await executeVideoGeneration({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'a cinematic sunrise',
      duration: 5,
      aspect_ratio: '16:9',
      resolution: '720p',
    }, runtime);

    assert.equal(result.video, 'data:video/mp4;base64,QUJD');
    const videosDir = path.join(STORAGE_PATHS.generatedDir, 'videos');
    assert.equal(fs.existsSync(videosDir) ? fs.readdirSync(videosDir).length : 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    cleanupStorage();
  }
});
