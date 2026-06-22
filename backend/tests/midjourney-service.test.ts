import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NODE_EXECUTORS } from '../src/engine/nodes/index.ts';
import { executeMidjourneyImagine } from '../src/platform/ai/midjourney-service.ts';

function createRuntime(overrides = {}) {
  return {
    apiKey: 'tt-demo-key',
    baseUrl: 'https://api.ttapi.io',
    providerConfig: {
      authType: 'custom',
      customHeaderName: 'TT-API-KEY',
      customPrefix: '',
      midjourneyPollIntervalMs: 0,
      midjourneyMaxAttempts: 3,
    },
    projectModels: [
      {
        id: 'midjourney',
        modelId: 'midjourney',
        type: 'image',
        enabled: true,
        endpointMode: 'custom',
        customEndpoint: '/midjourney/v1/imagine',
        configured: true,
        source: 'manual',
      },
    ],
    ...overrides,
  };
}

test('executeMidjourneyImagine submits Imagine and polls Fetch with TT-API-KEY', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
  let pollCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      method: String(options.method || 'GET'),
      headers: new Headers(options.headers),
      body: options.body ? JSON.parse(String(options.body)) : undefined,
    });

    if (String(options.method) === 'POST') {
      return new Response(JSON.stringify({ status: 'SUCCESS', data: { job_id: 'job-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    pollCount += 1;
    return new Response(
      JSON.stringify(
        pollCount === 1
          ? { status: 'PENDING_QUEUE ', data: { progress: '25' } }
          : {
              data: {
                status: 'SUCCESS',
                images: ['https://cdn.example.com/1.png', 'https://cdn.example.com/2.png'],
                components: ['U1', 'U2', 'V1', 'V2'],
              },
            },
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const progress: string[] = [];
    const result = await executeMidjourneyImagine(
      { model: 'midjourney', prompt: 'cinematic cat', mode: 'turbo' },
      createRuntime(),
      (message) => progress.push(message),
    );

    assert.deepEqual(requests.map((request) => request.url), [
      'https://api.ttapi.io/midjourney/v1/imagine',
      'https://api.ttapi.io/midjourney/v1/fetch?jobId=job-123',
      'https://api.ttapi.io/midjourney/v1/fetch?jobId=job-123',
    ]);
    assert.equal(requests[0].headers.get('TT-API-KEY'), 'tt-demo-key');
    assert.deepEqual(requests[0].body, { prompt: 'cinematic cat', mode: 'turbo' });
    assert.deepEqual(result.images, [
      'https://cdn.example.com/1.png',
      'https://cdn.example.com/2.png',
    ]);
    assert.deepEqual(result.task.components, ['U1', 'U2', 'V1', 'V2']);
    assert.equal(result.task.jobId, 'job-123');
    assert.equal(result.task.response.status, 'SUCCESS');
    assert.match(progress.join('\n'), /25%/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeMidjourneyImagine reports terminal provider failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if (String(options.method) === 'POST') {
      return new Response(JSON.stringify({ jobId: 'job-failed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ data: { status: 'FAILED', message: 'blocked prompt' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      executeMidjourneyImagine(
        { model: 'midjourney', prompt: 'blocked prompt', mode: 'fast' },
        createRuntime(),
      ),
      /blocked prompt/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aiV3 midjourney mode uses the unified input/result contract and keeps task data in metadata', async () => {
  const originalFetch = globalThis.fetch;
  const previousConfigDir = process.env.APP_CONFIG_DIR;
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-midjourney-ai-v3-'));
  process.env.APP_CONFIG_DIR = storageRoot;
  let submittedBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, options = {}) => {
    if (String(options.method) === 'POST') {
      submittedBody = JSON.parse(String(options.body));
      return new Response(JSON.stringify({ jobId: 'job-node' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://93.184.216.34/grid.png') {
      return new Response(Buffer.from('89504e470d0a1a0a', 'hex'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    return new Response(
      JSON.stringify({ status: 'SUCCESS', cdnImage: 'https://93.184.216.34/grid.png', components: ['U1'] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const result = await NODE_EXECUTORS.aiV3(
      {
        type: 'aiV3',
        data: { model: 'midjourney', mode: 'midjourney', mjMode: 'relax', prompt: 'local detail' },
      },
      { input: ['upstream prompt', 'second prompt'] },
      createRuntime({
        scope: { userId: 'midjourney-test', workspaceId: 'default', runtimeMode: 'local-web' },
      }),
      () => {},
    );

    assert.deepEqual(submittedBody, {
      prompt: 'upstream prompt\nsecond prompt\nlocal detail',
      mode: 'relax',
    });
    assert.equal(Array.isArray(result.result), true);
    assert.match(result.result[0], /^\/api\/outputs\/images\/.+\.png$/);
    assert.equal('meta' in result, true);
    if (!('meta' in result)) assert.fail('aiV3 midjourney result must include metadata');
    assert.equal('task' in result.meta, true);
    if (!('task' in result.meta)) assert.fail('aiV3 midjourney metadata must include task details');
    const task = result.meta.task as { jobId?: unknown };
    assert.equal(task.jobId, 'job-node');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousConfigDir === undefined) {
      delete process.env.APP_CONFIG_DIR;
    } else {
      process.env.APP_CONFIG_DIR = previousConfigDir;
    }
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
