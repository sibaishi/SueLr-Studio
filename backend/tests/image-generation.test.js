import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateImages, normalizeImageGenerationRequest, resolveImageGenerationModel } from '../src/engine/helpers/imageGeneration.js';
import { ensureStorageDirectories, STORAGE_PATHS } from '../src/platform/storage/index.js';

function withTempStorage() {
  const previous = process.env.APP_CONFIG_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-image-generation-'));
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

function assertGeneratedPngOutput(result) {
  assert.equal(result.images.length, 1);
  assert.match(result.images[0], /^\/api\/outputs\/images\/.+\.png$/);
}

test('normalizeImageGenerationRequest extracts dimensions from prompt when sizing is auto', () => {
  const normalized = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '1023x1790 neon city poster',
    ratio: 'auto',
  });

  assert.equal(normalized.prompt, 'neon city poster');
  assert.equal(normalized.width, 1024);
  assert.equal(normalized.height, 1792);
  assert.equal(normalized.size, '1024x1792');
  assert.equal(normalized.aspect_ratio, undefined);
});

test('normalizeImageGenerationRequest extracts ratio from prompt when sizing is auto', () => {
  const normalized = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '16:9 cinematic skyline',
    ratio: 'auto',
  });

  assert.equal(normalized.prompt, 'cinematic skyline');
  assert.equal(normalized.ratio, '16:9');
  assert.equal(normalized.size, '1792x1024');
  assert.equal(normalized.aspect_ratio, undefined);
});

test('normalizeImageGenerationRequest infers common orientation words from prompt', () => {
  const portrait = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: 'portrait cyberpunk city',
    ratio: 'auto',
  });
  const banner = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: 'banner product photo',
    ratio: 'auto',
  });
  const square = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: 'avatar icon render',
    ratio: 'auto',
  });

  assert.equal(portrait.ratio, '9:16');
  assert.equal(portrait.size, '1024x1792');
  assert.equal(banner.ratio, '16:9');
  assert.equal(banner.size, '1792x1024');
  assert.equal(square.ratio, '1:1');
  assert.equal(square.size, '1024x1024');
});

test('normalizeImageGenerationRequest handles Chinese sizing terms from prompt', () => {
  const vertical = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '\u7ad6\u7248\u624b\u673a\u58c1\u7eb8\uff0c\u8d5b\u535a\u57ce\u5e02',
    ratio: 'auto',
  });
  const dimensions = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '\u56fe\u7247\u5c3a\u5bf8 1151x2047\uff0c\u672a\u6765\u6d77\u62a5',
    ratio: 'auto',
  });

  assert.equal(vertical.ratio, '9:16');
  assert.equal(vertical.size, '1024x1792');
  assert.equal(dimensions.prompt, '\u672a\u6765\u6d77\u62a5');
  assert.equal(dimensions.size, '1152x2048');
});

test('normalizeImageGenerationRequest extracts px dimensions with multiplication symbol', () => {
  const normalized = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: 'poster image size 1080px \u00d7 1920px neon city',
    ratio: 'auto',
  });

  assert.equal(normalized.prompt, 'poster image size neon city');
  assert.equal(normalized.width, 1088);
  assert.equal(normalized.height, 1920);
  assert.equal(normalized.size, '1088x1920');
});

test('normalizeImageGenerationRequest prefers px dimensions before Chinese sentence punctuation', () => {
  const normalized = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '\u751f\u6210\u6d77\u62a5\uff0c\u56fe\u7247\u5c3a\u5bf8\uff1a1080px \u00d7 1920px\u3002\u7248\u5f0f\uff1a\u7ad6\u7248\u6784\u56fe',
    ratio: 'auto',
  });

  assert.equal(normalized.prompt, '\u751f\u6210\u6d77\u62a5\u3002\u7248\u5f0f\uff1a\u7ad6\u7248\u6784\u56fe');
  assert.equal(normalized.ratio, 'auto');
  assert.equal(normalized.width, 1088);
  assert.equal(normalized.height, 1920);
  assert.equal(normalized.size, '1088x1920');
});

test('normalizeImageGenerationRequest keeps explicit node sizing above prompt sizing', () => {
  const explicitRatio = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '9:16 portrait city',
    ratio: '1:1',
  });
  const explicitDimensions = normalizeImageGenerationRequest({
    model: 'demo-image-model',
    prompt: '16:9 cinematic skyline',
    ratio: 'auto',
    width: 2048,
    height: 1024,
  });

  assert.equal(explicitRatio.prompt, '9:16 portrait city');
  assert.equal(explicitRatio.ratio, '1:1');
  assert.equal(explicitRatio.size, '1024x1024');
  assert.equal(explicitDimensions.prompt, '16:9 cinematic skyline');
  assert.equal(explicitDimensions.ratio, 'auto');
  assert.equal(explicitDimensions.size, '2048x1024');
});

test('resolveImageGenerationModel auto-selects the only configured image model', () => {
  const normalized = normalizeImageGenerationRequest({
    prompt: 'draw a mountain',
  });

  assert.equal(resolveImageGenerationModel(normalized, createRuntimeConfig()), 'demo-image-model');
});

test('resolveImageGenerationModel asks for a model when multiple image candidates match', () => {
  const normalized = normalizeImageGenerationRequest({
    prompt: 'draw a mountain',
  });

  assert.throws(
    () => resolveImageGenerationModel(normalized, createRuntimeConfig({
      projectModels: [
        {
          id: 'image-a',
          modelId: 'image-a',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
        {
          id: 'image-b',
          modelId: 'image-b',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    })),
    /Multiple image models.*image-a, image-b/,
  );
});

test('resolveImageGenerationModel treats chat-endpoint image models as edit candidates', () => {
  const normalized = normalizeImageGenerationRequest({
    prompt: 'edit this image',
    image: ['data:image/png;base64,YWJj'],
  });

  assert.equal(resolveImageGenerationModel(normalized, createRuntimeConfig({
    projectModels: [
      {
        id: 'chat-image-model',
        modelId: 'chat-image-model',
        type: 'image',
        enabled: true,
        endpointMode: 'category',
        endpointCategory: 'chat',
      },
    ],
  })), 'chat-image-model');
});

test('generateImages uses auto-selected image model when request omits model', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      prompt: 'draw a mountain',
    }, createRuntimeConfig());

    assertGeneratedPngOutput(result);
    assert.equal(result.request.model, 'demo-image-model');
    assert.equal(requestBody.model, 'demo-image-model');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages can leave generated image data unpersisted for workflow output nodes', async () => {
  const cleanupStorage = withTempStorage();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      { b64_json: 'YWJj' },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const result = await generateImages({
      prompt: 'draw a mountain',
    }, createRuntimeConfig({ persistGeneratedOutputs: false }));

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    const imagesDir = path.join(STORAGE_PATHS.generatedDir, 'images');
    assert.equal(fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).length : 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    cleanupStorage();
  }
});

test('generateImages starts all requested image attempts concurrently and preserves output order', async () => {
  const originalFetch = globalThis.fetch;
  const allRequestsStarted = (() => {
    let resolve;
    const promise = new Promise((promiseResolve) => {
      resolve = promiseResolve;
    });
    return { promise, resolve };
  })();
  let startedRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  globalThis.fetch = async () => {
    startedRequests += 1;
    const requestIndex = startedRequests;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    if (startedRequests === 8) {
      allRequestsStarted.resolve();
    }

    await allRequestsStarted.promise;
    activeRequests -= 1;

    return new Response(JSON.stringify({
      data: [
        { b64_json: Buffer.from(`image-${requestIndex}`).toString('base64') },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await generateImages({
      prompt: 'draw a mountain',
      n: 8,
    }, createRuntimeConfig({
      persistGeneratedOutputs: false,
      workflowExecution: { enabled: true, maxConcurrency: 8 },
    }));

    assert.equal(startedRequests, 8);
    assert.equal(maxActiveRequests, 8);
    assert.deepEqual(
      result.images,
      Array.from({ length: 8 }, (_item, index) => (
        `data:image/png;base64,${Buffer.from(`image-${index + 1}`).toString('base64')}`
      )),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages applies workflow concurrency limit to n image attempts', async () => {
  const originalFetch = globalThis.fetch;
  let startedRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  globalThis.fetch = async () => {
    startedRequests += 1;
    const requestIndex = startedRequests;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequests -= 1;

    return new Response(JSON.stringify({
      data: [
        { b64_json: Buffer.from(`limited-image-${requestIndex}`).toString('base64') },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await generateImages({
      prompt: 'draw a mountain',
      n: 5,
    }, createRuntimeConfig({
      persistGeneratedOutputs: false,
      workflowExecution: { enabled: true, maxConcurrency: 2 },
    }));

    assert.equal(startedRequests, 5);
    assert.equal(maxActiveRequests, 2);
    assert.deepEqual(
      result.images,
      Array.from({ length: 5 }, (_item, index) => (
        `data:image/png;base64,${Buffer.from(`limited-image-${index + 1}`).toString('base64')}`
      )),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages keeps successful concurrent attempts when one image request fails', async () => {
  const originalFetch = globalThis.fetch;
  const allRequestsStarted = (() => {
    let resolve;
    const promise = new Promise((promiseResolve) => {
      resolve = promiseResolve;
    });
    return { promise, resolve };
  })();
  const progress = [];
  let startedRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  globalThis.fetch = async () => {
    startedRequests += 1;
    const requestIndex = startedRequests;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    if (startedRequests === 4) {
      allRequestsStarted.resolve();
    }

    await allRequestsStarted.promise;
    activeRequests -= 1;

    if (requestIndex === 2) {
      return new Response(JSON.stringify({
        error: { message: 'temporary provider failure' },
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      data: [
        { b64_json: Buffer.from(`partial-image-${requestIndex}`).toString('base64') },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await generateImages({
      prompt: 'draw a mountain',
      n: 4,
    }, createRuntimeConfig({
      persistGeneratedOutputs: false,
      workflowExecution: { enabled: true, maxConcurrency: 4 },
    }), (message) => progress.push(message));

    assert.equal(startedRequests, 4);
    assert.equal(maxActiveRequests, 4);
    assert.deepEqual(result.images, [1, 3, 4].map((index) => (
      `data:image/png;base64,${Buffer.from(`partial-image-${index}`).toString('base64')}`
    )));
    assert.match(progress.join('\n'), /部分图片生成失败.*1\/4/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages resolves model ids when chat tool calls add spaces around hyphens', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      model: 'doubao - seedream - 4 - 5 - 251128',
      prompt: 'draw a mountain',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'doubao-seedream-4-5-251128',
          modelId: 'doubao-seedream-4-5-251128',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(result.request.model, 'doubao-seedream-4-5-251128');
    assert.equal(requestBody.model, 'doubao-seedream-4-5-251128');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends configured non-Gemini resolution through base model body', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      model: 'gpt-image-2',
      prompt: 'draw a mountain',
      resolution: '4k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gpt-image-2',
          modelId: 'gpt-image-2',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
        {
          id: 'gpt-image-2-4k',
          modelId: 'gpt-image-2-4k',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(result.request.model, 'gpt-image-2');
    assert.equal(result.request.resolution, '4k');
    assert.equal(requestBody.model, 'gpt-image-2');
    assert.equal(requestBody.resolution, '4k');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends unlisted resolution through base model body', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];

  globalThis.fetch = async (_url, options = {}) => {
    const requestBody = JSON.parse(String(options.body));
    requestBodies.push(requestBody);

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
      model: 'gpt-image-2',
      prompt: 'draw a mountain',
      resolution: '4k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gpt-image-2',
          modelId: 'gpt-image-2',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0].model, 'gpt-image-2');
    assert.equal(requestBodies[0].resolution, '4k');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages infers non-Gemini suffix resolution and sends it in request body', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      model: 'gemini-3.1-flash-image-preview-512px',
      prompt: 'draw a mountain',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gemini-3.1-flash-image-preview-512px',
          modelId: 'gemini-3.1-flash-image-preview-512px',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(result.request.model, 'gemini-3.1-flash-image-preview');
    assert.equal(result.request.resolution, '512px');
    assert.equal(requestBody.model, 'gemini-3.1-flash-image-preview');
    assert.equal(requestBody.resolution, '512px');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends explicit non-Gemini suffix model as base model with resolution body', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      model: 'gpt-image-2-flatfee-2k',
      prompt: 'draw a mountain',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gpt-image-2-flatfee',
          modelId: 'gpt-image-2-flatfee',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
        {
          id: 'gpt-image-2-flatfee-2k',
          modelId: 'gpt-image-2-flatfee-2k',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(result.request.model, 'gpt-image-2-flatfee');
    assert.equal(result.request.resolution, '2k');
    assert.equal(requestBody.model, 'gpt-image-2-flatfee');
    assert.equal(requestBody.resolution, '2k');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

    assertGeneratedPngOutput(result);
    assert.equal(attempts, 3);
    assert.ok(progress.join('\n').includes('2/3'));
    assert.ok(progress.join('\n').includes('3/3'));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('generateImages keeps remote URL output when download times out', async () => {
  const originalFetch = globalThis.fetch;
  const progress = [];
  let requestCount = 0;
  const remoteUrl = 'http://127.0.0.1/generated-image.png';

  globalThis.fetch = async (url, options = {}) => {
    requestCount += 1;
    if (options.method === 'POST') {
      return new Response(JSON.stringify({
        data: [
          { url: remoteUrl },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    assert.equal(String(url), remoteUrl);
    const error = new Error('fetch failed');
    error.cause = {
      code: 'UND_ERR_CONNECT_TIMEOUT',
      message: 'Connect Timeout Error',
    };
    throw error;
  };

  try {
    const result = await generateImages({
      model: 'demo-image-model',
      prompt: 'draw a mountain',
    }, createRuntimeConfig(), (message) => {
      progress.push(message);
    });

    assert.deepEqual(result.images, [remoteUrl]);
    assert.equal(requestCount, 2);
    assert.match(progress.join('\n'), /返回图片URL\[1\]: http:\/\/127\.0\.0\.1\/generated-image\.png/);
    assert.match(progress.join('\n'), /下载远程图片失败，已保留原始URL继续流程/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends resolved size without duplicate aspect_ratio for ratio sizing', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

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
      ratio: '16:9',
    }, createRuntimeConfig());

    assertGeneratedPngOutput(result);
    assert.equal(requestBody.size, '1792x1024');
    assert.equal(requestBody.aspect_ratio, undefined);
    assert.equal(requestBody.response_format, 'url');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages upscales Ark Seedream 4.5 ratio sizes without changing other providers', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];

  globalThis.fetch = async (_url, options = {}) => {
    requestBodies.push(JSON.parse(String(options.body)));

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
    await generateImages({
      model: 'doubao-seedream-4-5-251128',
      prompt: 'draw a square icon',
      ratio: '1:1',
    }, createRuntimeConfig({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      projectModels: [
        {
          id: 'doubao-seedream-4-5-251128',
          modelId: 'doubao-seedream-4-5-251128',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    await generateImages({
      model: 'doubao-seedream-4-5-251128',
      prompt: 'draw a square icon',
      ratio: '1:1',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'doubao-seedream-4-5-251128',
          modelId: 'doubao-seedream-4-5-251128',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assert.equal(requestBodies[0].size, '1920x1920');
    assert.equal(requestBodies[1].size, '1024x1024');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages falls back when url response format is unsupported', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  const progress = [];

  globalThis.fetch = async (_url, options = {}) => {
    const requestBody = JSON.parse(String(options.body));
    requestBodies.push(requestBody);

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: { message: 'Unknown parameter: response_format' },
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
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
    }, createRuntimeConfig(), (message) => progress.push(message));

    assertGeneratedPngOutput(result);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].response_format, 'url');
    assert.equal(requestBodies[1].response_format, undefined);
    assert.match(progress.join('\n'), /response_format=url/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages falls back when output format is unsupported', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  const progress = [];

  globalThis.fetch = async (_url, options = {}) => {
    const requestBody = JSON.parse(String(options.body));
    requestBodies.push(requestBody);

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: { message: 'The parameter `output_format` is not supported by this model' },
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
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
      prompt: 'draw a cat',
      output_format: 'png',
    }, createRuntimeConfig(), (message) => progress.push(message));

    assertGeneratedPngOutput(result);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].output_format, 'png');
    assert.equal(requestBodies[1].output_format, undefined);
    assert.equal(requestBodies[1].response_format, 'url');
    assert.match(progress.join('\n'), /output_format/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages supports Gemini generateContent image endpoints without changing compatible routes', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestHeaders = null;
  let requestBody = null;

  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url);
    requestHeaders = options.headers;
    requestBody = JSON.parse(String(options.body));

    return new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'YWJj',
                },
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
      model: 'gemini-3-pro-image-preview-4k',
      prompt: 'poster 1080x1920 neon city',
      ratio: 'auto',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'demo-image-model',
          modelId: 'gemini-3-pro-image-preview-4k',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'gemini-generate-content',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(requestUrl, 'https://example.com/v1beta/models/gemini-3-pro-image-preview-4k:generateContent?key=demo-key');
    assert.equal(requestHeaders.Authorization, undefined);
    assert.equal(requestHeaders['Content-Type'], 'application/json');
    assert.equal(requestBody.contents[0].parts[0].text.includes('Generate an image from this prompt:'), true);
    assert.equal(requestBody.contents[0].parts[0].text.includes('Size: 1088x1920'), true);
    assert.equal(requestBody.contents[0].parts[0].text.includes('1080x1920'), false);
    assert.deepEqual(requestBody.generationConfig, {
      imageConfig: {
        imageSize: '4K',
      },
    });
    assert.equal(requestBody.model, undefined);
    assert.equal(requestBody.messages, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends Gemini imageConfig for native aspect ratio and resolution', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

    return new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'YWJj',
                },
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
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'poster',
      ratio: '9:16',
      resolution: '2k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gemini-3.1-flash-image-preview',
          modelId: 'gemini-3.1-flash-image-preview',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'gemini-generate-content',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.deepEqual(requestBody.generationConfig, {
      imageConfig: {
        aspectRatio: '9:16',
        imageSize: '2K',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages maps 1k resolution to Gemini native imageSize', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));

    return new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'YWJj',
                },
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
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'poster',
      resolution: '1k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gemini-3.1-flash-image-preview',
          modelId: 'gemini-3.1-flash-image-preview',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'gemini-generate-content',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.deepEqual(requestBody.generationConfig, {
      imageConfig: {
        imageSize: '1K',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages routes Gemini resolution through model suffix endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const requestUrls = [];
  const requestBodies = [];

  globalThis.fetch = async (url, options = {}) => {
    requestUrls.push(String(url));
    requestBodies.push(JSON.parse(String(options.body)));

    return new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'YWJj',
                },
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
      model: 'gemini-3-pro-image-preview',
      prompt: 'poster',
      resolution: '4k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gemini-3-pro-image-preview',
          modelId: 'gemini-3-pro-image-preview',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'gemini-generate-content',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(requestUrls.length, 1);
    assert.equal(requestUrls[0], 'https://example.com/v1beta/models/gemini-3-pro-image-preview-4k:generateContent?key=demo-key');
    assert.deepEqual(requestBodies[0].generationConfig, {
      imageConfig: {
        imageSize: '4K',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sets non-streaming chat image payloads and logs body read failures', async () => {
  const originalFetch = globalThis.fetch;
  const progress = [];
  let requestBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(String(options.body));
    const error = new Error('terminated');
    error.cause = {
      code: 'ECONNRESET',
      message: 'read ECONNRESET',
    };

    return new Response(new ReadableStream({
      start(controller) {
        controller.error(error);
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  };

  try {
    await assert.rejects(
      generateImages({
        model: 'demo-image-model',
        prompt: 'draw a mountain',
        ratio: '16:9',
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
      }), (message) => progress.push(message)),
      /ECONNRESET/,
    );

    assert.equal(requestBody.stream, false);
    assert.deepEqual(requestBody.response_format, { type: 'url' });
    assert.match(progress.join('\n'), /status=200/);
    assert.match(progress.join('\n'), /ECONNRESET/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages falls back for chat response format type errors', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  const progress = [];

  globalThis.fetch = async (_url, options = {}) => {
    const requestBody = JSON.parse(String(options.body));
    requestBodies.push(requestBody);

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: {
          message: 'json: cannot unmarshal string into Go struct field GeneralOpenAIRequest.response_format of type ResponseFormat',
        },
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

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
      prompt: 'draw a mountain',
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
    }), (message) => progress.push(message));

    assertGeneratedPngOutput(result);
    assert.equal(requestBodies.length, 2);
    assert.deepEqual(requestBodies[0].response_format, { type: 'url' });
    assert.equal(requestBodies[1].response_format, undefined);
    assert.match(progress.join('\n'), /response_format=url/);
  } finally {
    globalThis.fetch = originalFetch;
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

test('generateImages logs one ImageRequest entry for a single image edit request', async () => {
  const originalFetch = globalThis.fetch;
  const progress = [];
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      method: options.method,
      body: options.body,
    });

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
      prompt: 'turn this into a render',
      image: ['data:image/png;base64,QUJD'],
    }, createRuntimeConfig(), (message) => progress.push(message));

    const imageRequestLogs = progress.filter((message) => message.includes('[ImageRequest]'));

    assertGeneratedPngOutput(result);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/v1/images/edits');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body instanceof FormData, true);
    assert.equal(imageRequestLogs.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends image edit resolution through base model form field', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      body: options.body,
    });

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
      model: 'gpt-image-2',
      prompt: 'turn this into a render',
      image: ['data:image/png;base64,QUJD'],
      resolution: '4k',
    }, createRuntimeConfig({
      projectModels: [
        {
          id: 'gpt-image-2',
          modelId: 'gpt-image-2',
          type: 'image',
          enabled: true,
          endpointMode: 'category',
          endpointCategory: 'image',
        },
      ],
    }));

    assertGeneratedPngOutput(result);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/v1/images/edits');
    assert.equal(requests[0].body.get('model'), 'gpt-image-2');
    assert.equal(requests[0].body.get('resolution'), '4k');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages resolves local API image URLs before sending edit requests upstream', async () => {
  const cleanup = withTempStorage();
  const originalFetch = globalThis.fetch;
  let uploadedBlob = null;

  try {
    fs.writeFileSync(path.join(STORAGE_PATHS.uploadsDir, 'source.png'), Buffer.from('ABC'));

    globalThis.fetch = async (_url, options = {}) => {
      uploadedBlob = options.body.get('image');
      return new Response(JSON.stringify({
        data: [
          { b64_json: 'YWJj' },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await generateImages({
      model: 'demo-image-model',
      prompt: 'turn this into a render',
      image: ['http://127.0.0.1:3001/api/files/source.png'],
    }, createRuntimeConfig());

    assertGeneratedPngOutput(result);
    assert.equal(uploadedBlob?.type, 'image/png');
    assert.equal(uploadedBlob?.size, 3);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test('generateImages extracts nested image URLs from varied upstream response bodies', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    result: {
      output_url: 'data:image/png;base64,YWJj',
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const result = await generateImages({
      model: 'demo-image-model',
      prompt: 'draw a mountain',
    }, createRuntimeConfig());

    assertGeneratedPngOutput(result);
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
      resolution: '2k',
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

    assertGeneratedPngOutput(result);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/v1/chat/completions');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body instanceof FormData, false);

    const payload = JSON.parse(String(requests[0].body));
    assert.equal(payload.model, 'demo-image-model');
    assert.equal(payload.stream, false);
    assert.deepEqual(payload.response_format, { type: 'url' });
    assert.equal(payload.quality, 'high');
    assert.equal(payload.resolution, '2k');
    assert.equal(payload.size, '2048x2048');
    assert.equal(payload.messages?.[0]?.role, 'user');
    assert.ok(Array.isArray(payload.messages?.[0]?.content));
    assert.equal(payload.messages[0].content[0].type, 'text');
    assert.match(payload.messages[0].content[0].text, /turn this into a render/);
    assert.match(payload.messages[0].content[0].text, /2k/);
    assert.equal(payload.messages[0].content[1].type, 'image_url');
    assert.equal(payload.messages[0].content[1].image_url.url, 'data:image/png;base64,QUJD');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImages sends chat image resolution through base model body', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];

  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(String(options.body));
    requestBodies.push(body);

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
      resolution: '2k',
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

    assertGeneratedPngOutput(result);
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0].model, 'demo-image-model');
    assert.equal(requestBodies[0].resolution, '2k');
    assert.match(requestBodies[0].messages[0].content[0].text, /2k/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
