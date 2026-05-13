import test from 'node:test';
import assert from 'node:assert/strict';

import { generateImages, normalizeImageGenerationRequest } from '../src/engine/helpers/imageGeneration.js';

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

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(requestBody.size, '1792x1024');
    assert.equal(requestBody.aspect_ratio, undefined);
    assert.equal(requestBody.response_format, 'url');
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

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].response_format, 'url');
    assert.equal(requestBodies[1].response_format, undefined);
    assert.match(progress.join('\n'), /response_format=url/);
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

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(requestUrl, 'https://example.com/v1beta/models/gemini-3-pro-image-preview-4k:generateContent?key=demo-key');
    assert.equal(requestHeaders.Authorization, undefined);
    assert.equal(requestHeaders['Content-Type'], 'application/json');
    assert.equal(requestBody.contents[0].parts[0].text.includes('Generate an image from this prompt:'), true);
    assert.equal(requestBody.contents[0].parts[0].text.includes('Size: 1088x1920'), true);
    assert.equal(requestBody.contents[0].parts[0].text.includes('1080x1920'), false);
    assert.equal(requestBody.model, undefined);
    assert.equal(requestBody.messages, undefined);
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

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
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

    assert.deepEqual(result.images, ['data:image/png;base64,YWJj']);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/v1/images/edits');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body instanceof FormData, true);
    assert.equal(imageRequestLogs.length, 1);
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
    assert.equal(payload.stream, false);
    assert.deepEqual(payload.response_format, { type: 'url' });
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
