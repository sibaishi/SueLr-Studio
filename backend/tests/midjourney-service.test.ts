import assert from 'node:assert/strict';
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

test('midjourneyGen executor uses the unified input/result contract and keeps task data in metadata', async () => {
  const originalFetch = globalThis.fetch;
  let submittedBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, options = {}) => {
    if (String(options.method) === 'POST') {
      submittedBody = JSON.parse(String(options.body));
      return new Response(JSON.stringify({ jobId: 'job-node' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://cdn.example.com/grid.png') {
      return new Response(Buffer.from('ABC'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    return new Response(
      JSON.stringify({ status: 'SUCCESS', cdnImage: 'https://cdn.example.com/grid.png', components: ['U1'] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const result = await NODE_EXECUTORS.midjourneyGen(
      {
        type: 'midjourneyGen',
        data: { model: 'midjourney', mode: 'relax', prompt: 'local detail' },
      },
      { input: ['upstream prompt', { type: 'text', text: 'second prompt' }] },
      createRuntime(),
      () => {},
    );

    assert.deepEqual(submittedBody, {
      prompt: 'upstream prompt\nsecond prompt\nlocal detail',
      mode: 'relax',
    });
    assert.deepEqual(result.result, ['data:image/png;base64,QUJD']);
    assert.equal(result.meta.task.jobId, 'job-node');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
