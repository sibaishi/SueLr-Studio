import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase2-http-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name) {
  process.env.APP_STORAGE_DIR = createStorageDir(name);
  const { createApp } = await import(`../src/app/create-app.js?test=${Date.now()}`);
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function assertEnvelopeShape(body) {
  assert.equal(typeof body?.success, 'boolean');
  const allowedKeys = body.success ? ['data', 'success'] : ['error', 'success'];
  assert.deepEqual(Object.keys(body).sort(), allowedKeys);
}

test('HTTP contract: settings endpoints use unified envelope', async () => {
  const { server, baseUrl } = await createTestServer('settings');
  try {
    const initial = await requestJson(baseUrl, '/api/settings/studio');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.success, true);
    assert.equal(initial.body.data.ui.theme, 'dark');
    assert.equal(initial.body.data.runtime.tavilyApiKey, '');

    const publicSettings = await requestJson(baseUrl, '/api/settings');
    assert.equal(publicSettings.status, 200);
    assert.equal(publicSettings.body.success, true);
    assert.equal(publicSettings.body.data.tavilyApiKey, undefined);
    assert.equal(publicSettings.body.data.apiKey, undefined);

    const updated = await requestJson(baseUrl, '/api/settings/studio', {
      method: 'PUT',
      body: JSON.stringify({ ui: { theme: 'light' } }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.success, true);
    assert.equal(updated.body.data.ui.theme, 'light');

    const invalid = await requestJson(baseUrl, '/api/settings/studio', {
      method: 'PUT',
      body: JSON.stringify([]),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '请求体必须为对象',
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: settings test-api blocks local provider targets', async () => {
  process.env.APP_HOST = '0.0.0.0';
  const { server, baseUrl } = await createTestServer('settings-ssrf');
  try {
    const blocked = await requestJson(baseUrl, '/api/settings/test-api', {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'demo', baseUrl: 'https://127.0.0.1:3001/v1' }),
    });

    assert.equal(blocked.status, 400);
    assert.deepEqual(blocked.body, {
      success: false,
      error: {
        code: 'REMOTE_HOST_FORBIDDEN',
        message: 'Base URL 不允许使用本机或内网地址',
      },
    });
  } finally {
    delete process.env.APP_HOST;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: workflows CRUD endpoints return expected envelopes', async () => {
  const { server, baseUrl } = await createTestServer('workflows');
  try {
    const beforeList = await requestJson(baseUrl, '/api/workflows');
    assert.equal(beforeList.status, 200);
    const initialCount = beforeList.body.data.length;

    const created = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Contract Workflow',
        nodes: [{ id: 'node-1', type: 'textInput', data: {} }],
        edges: [],
      }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.success, true);
    assert.equal(created.body.data.name, 'Contract Workflow');
    assert.ok(created.body.data.id.startsWith('wf_'));

    const workflowId = created.body.data.id;
    const listed = await requestJson(baseUrl, '/api/workflows');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.success, true);
    assert.equal(listed.body.data.length, initialCount + 1);
    assert.ok(listed.body.data.some((workflow) => workflow.id === workflowId));

    const fetched = await requestJson(baseUrl, `/api/workflows/${workflowId}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.success, true);
    assert.equal(fetched.body.data.id, workflowId);

    const exported = await requestJson(baseUrl, `/api/workflows/${workflowId}/export`);
    assert.equal(exported.status, 200);
    assert.equal(exported.body.success, true);
    assert.equal(exported.body.data.id, workflowId);

    const imported = await requestJson(baseUrl, '/api/workflows/import?generateNewId=true', {
      method: 'POST',
      body: JSON.stringify(exported.body.data),
    });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.success, true);
    assertEnvelopeShape(imported.body);
    assert.equal(imported.body.data.workflow.name, 'Contract Workflow');
    assert.equal(imported.body.data.report.result, 'imported_with_warnings');

    const conflict = await requestJson(baseUrl, '/api/workflows/import?mode=preserve_id', {
      method: 'POST',
      body: JSON.stringify(exported.body.data),
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.success, false);
    assert.equal(conflict.body.error.code, 'WORKFLOW_IMPORT_CONFLICT');

    const overwritten = await requestJson(baseUrl, '/api/workflows/import?mode=overwrite', {
      method: 'POST',
      body: JSON.stringify(exported.body.data),
    });
    assert.equal(overwritten.status, 200);
    assert.equal(overwritten.body.success, true);
    assertEnvelopeShape(overwritten.body);
    assert.equal(overwritten.body.data.workflow.id, workflowId);

    const deleted = await requestJson(baseUrl, `/api/workflows/${workflowId}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { success: true, data: null });

    const missing = await requestJson(baseUrl, `/api/workflows/${workflowId}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.success, false);
    assert.equal(missing.body.error.code, 'WORKFLOW_NOT_FOUND');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: upload endpoint returns envelope-only payloads', async () => {
  const { server, baseUrl } = await createTestServer('upload');
  try {
    const formData = new FormData();
    formData.append('file', new Blob(['fake png bytes'], { type: 'image/png' }), 'sample.png');

    const response = await fetch(`${baseUrl}/api/files/upload`, {
      method: 'POST',
      body: formData,
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assertEnvelopeShape(body);
    assert.equal(body.success, true);
    assert.equal(body.data.fileName, 'sample.png');
    assert.equal(body.data.mimeType, 'image/png');
    assert.match(body.data.url, /^\/api\/files\//);
    assert.equal(body.url, undefined);
    assert.equal(body.fileName, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: assistant image save returns envelope-only payloads', async () => {
  const { server, baseUrl } = await createTestServer('assistant-images');
  try {
    const saved = await requestJson(baseUrl, '/api/assistant/images', {
      method: 'POST',
      body: JSON.stringify({
        id: 'image-contract',
        prompt: 'phase 2',
        model: 'demo-image-model',
        ts: Date.now(),
        url: 'https://example.com/image.png',
      }),
    });

    assert.equal(saved.status, 200);
    assertEnvelopeShape(saved.body);
    assert.equal(saved.body.success, true);
    assert.equal(saved.body.data.localUrl, 'https://example.com/image.png');
    assert.equal(saved.body.localUrl, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: assistant conversation endpoints stay on envelope-only responses', async () => {
  const { server, baseUrl } = await createTestServer('assistant-conversations');
  try {
    const updatedAt = Date.now();
    const conversations = [
      {
        id: 'conv-contract',
        title: 'Phase 2 Contract',
        messages: [{ role: 'user', content: 'hello' }],
        updatedAt,
      },
    ];

    const saved = await requestJson(baseUrl, '/api/assistant/conversations', {
      method: 'POST',
      body: JSON.stringify(conversations),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { success: true, data: null });

    const listed = await requestJson(baseUrl, '/api/assistant/conversations');
    assert.equal(listed.status, 200);
    assertEnvelopeShape(listed.body);
    assert.equal(Array.isArray(listed.body.data), true);
    assert.equal(listed.body.data[0].id, 'conv-contract');
    assert.deepEqual(listed.body.data[0].msgs, [{ role: 'user', content: 'hello' }]);
    assert.equal(listed.body.data[0].ts, updatedAt);
    assert.equal(listed.body.data[0].messages, undefined);
    assert.equal(listed.body.data[0].updatedAt, undefined);
    assert.equal(listed.body.messages, undefined);

    const deleted = await requestJson(baseUrl, '/api/assistant/conversations/conv-contract', {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { success: true, data: null });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: assistant generated file route rejects invalid relative paths', async () => {
  const { server, baseUrl } = await createTestServer('assistant-files-validation');
  try {
    const invalid = await requestJson(baseUrl, '/api/assistant/files/assistant-images%5C..%5Coutside.png');
    assert.equal(invalid.status, 400);
    assertEnvelopeShape(invalid.body);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: file delete route rejects unsafe filenames', async () => {
  const { server, baseUrl } = await createTestServer('files-validation');
  try {
    const invalid = await requestJson(baseUrl, '/api/files/.env', {
      method: 'DELETE',
    });
    assert.equal(invalid.status, 400);
    assertEnvelopeShape(invalid.body);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: execution status and cancel use runId routes', async () => {
  const { server, baseUrl } = await createTestServer('execution-runs');
  try {
    const created = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        id: 'wf_execution_run',
        name: 'Execution Run Workflow',
        nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello' } }],
        edges: [],
        settings: {},
      }),
    });
    assert.equal(created.status, 200);

    const response = await fetch(`${baseUrl}/api/execute/wf_execution_run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello' } }],
        edges: [],
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.text();
    const match = body.match(/event: workflow_snapshot_built\ndata: (.+?)\n\n/s);
    assert.ok(match);
    const snapshot = JSON.parse(match[1]);
    assert.equal(typeof snapshot.runId, 'string');

    const status = await requestJson(baseUrl, `/api/execute/runs/${snapshot.runId}/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.success, true);
    assert.equal(status.body.data.runId, snapshot.runId);

    const cancel = await requestJson(baseUrl, `/api/execute/runs/${snapshot.runId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.success, true);
    assert.equal(cancel.body.data.runId, snapshot.runId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities routes validate input and wrap success payloads', async () => {
  const { server, baseUrl } = await createTestServer('capabilities');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalSearch = capabilitiesService.search;
    capabilitiesService.search = async (body) => ({
      raw: { query: body.query },
      content: 'stubbed search result',
    });

    try {
      const success = await requestJson(baseUrl, '/api/capabilities/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'phase 2 contract', maxResults: 3 }),
      });
      assert.equal(success.status, 200);
      assert.deepEqual(success.body, {
        success: true,
        data: {
          raw: { query: 'phase 2 contract' },
          content: 'stubbed search result',
        },
      });

      const invalid = await requestJson(baseUrl, '/api/capabilities/search', {
        method: 'POST',
        body: JSON.stringify([]),
      });
      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求体必须为对象',
        },
      });

      const blankQuery = await requestJson(baseUrl, '/api/capabilities/search', {
        method: 'POST',
        body: JSON.stringify({ query: '   ' }),
      });
      assert.equal(blankQuery.status, 400);
      assertEnvelopeShape(blankQuery.body);
      assert.equal(blankQuery.body.error.code, 'VALIDATION_ERROR');
    } finally {
      capabilitiesService.search = originalSearch;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities chat route returns envelope-only payloads', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-chat');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalChat = capabilitiesService.chat;
    capabilitiesService.chat = async () => ({
      id: 'chatcmpl-contract',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'contract ok' },
        },
      ],
    });

    try {
      const success = await requestJson(baseUrl, '/api/capabilities/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'demo-chat-model',
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      assert.equal(success.status, 200);
      assertEnvelopeShape(success.body);
      assert.equal(success.body.data.id, 'chatcmpl-contract');
      assert.equal(success.body.id, undefined);

      const missingModel = await requestJson(baseUrl, '/api/capabilities/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      assert.equal(missingModel.status, 400);
      assertEnvelopeShape(missingModel.body);
      assert.equal(missingModel.body.error.code, 'VALIDATION_ERROR');
    } finally {
      capabilitiesService.chat = originalChat;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities chat stream route forwards SSE payloads', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-chat-stream');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalChatStream = capabilitiesService.chatStream;
    capabilitiesService.chatStream = async () => new Response(
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n'
      + 'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      },
    );

    try {
      const response = await fetch(`${baseUrl}/api/capabilities/chat?stream=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'demo-chat-model',
          messages: [{ role: 'user', content: 'ping' }],
          stream: true,
        }),
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/event-stream/i);
      const body = await response.text();
      assert.match(body, /data: \{"choices":\[\{"delta":\{"content":"hel"\}\}\]\}/);
      assert.match(body, /data: \[DONE\]/);
    } finally {
      capabilitiesService.chatStream = originalChatStream;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities chat stream route wraps JSON upstream as SSE events', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-chat-stream-json');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalChatStream = capabilitiesService.chatStream;
    capabilitiesService.chatStream = async () => new Response(
      JSON.stringify({
        id: 'chatcmpl-json-fallback',
        choices: [{ message: { role: 'assistant', content: 'json fallback' }, finish_reason: 'stop' }],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    try {
      const response = await fetch(`${baseUrl}/api/capabilities/chat?stream=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'demo-chat-model',
          messages: [{ role: 'user', content: 'ping' }],
          stream: true,
        }),
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/event-stream/i);
      const body = await response.text();
      assert.match(body, /data: \{"id":"chatcmpl-json-fallback","choices":\[/);
      assert.match(body, /data: \[DONE\]/);
    } finally {
      capabilitiesService.chatStream = originalChatStream;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities image route returns envelope-only payloads', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-image');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalImage = capabilitiesService.image;
    capabilitiesService.image = async () => ({
      images: ['https://example.com/generated.png'],
      request: { model: 'demo-image-model' },
    });

    try {
      const success = await requestJson(baseUrl, '/api/capabilities/image', {
        method: 'POST',
        body: JSON.stringify({ model: 'demo-image-model', prompt: 'phase 2 image' }),
      });

      assert.equal(success.status, 200);
      assertEnvelopeShape(success.body);
      assert.deepEqual(success.body, {
        success: true,
        data: {
          images: ['https://example.com/generated.png'],
          request: { model: 'demo-image-model' },
        },
      });
      assert.equal(success.body.images, undefined);
      assert.equal(success.body.request, undefined);
    } finally {
      capabilitiesService.image = originalImage;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities image route rejects invalid request bodies', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-image-validation');
  try {
    const cases = [
      {
        name: 'missing prompt',
        body: { model: 'demo-image-model' },
        message: 'prompt 不能为空',
      },
      {
        name: 'invalid image array',
        body: { model: 'demo-image-model', prompt: 'phase 2 image', image: 'https://example.com/image.png' },
        message: 'image 必须为数组',
      },
      {
        name: 'invalid image url',
        body: { model: 'demo-image-model', prompt: 'phase 2 image', image: ['file:///tmp/image.png'] },
        message: 'image[0] 不是允许的图片链接格式',
      },
      {
        name: 'invalid mask url',
        body: { model: 'demo-image-model', prompt: 'phase 2 image', mask: 'data:text/plain;base64,Zm9v' },
        message: 'mask 不是允许的图片链接格式',
      },
      {
        name: 'invalid n',
        body: { model: 'demo-image-model', prompt: 'phase 2 image', n: 0 },
        message: 'n 必须在 1 到 10 之间',
      },
    ];

    for (const item of cases) {
      const invalid = await requestJson(baseUrl, '/api/capabilities/image', {
        method: 'POST',
        body: JSON.stringify(item.body),
      });
      assert.equal(invalid.status, 400, item.name);
      assertEnvelopeShape(invalid.body);
      assert.equal(invalid.body.error.code, 'VALIDATION_ERROR', item.name);
      assert.equal(invalid.body.error.message, item.message, item.name);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities video route rejects invalid request bodies', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-video-validation');
  try {
    const cases = [
      {
        name: 'missing model',
        body: { prompt: 'phase 2 video' },
        message: 'model 不能为空',
      },
      {
        name: 'missing input',
        body: { model: 'demo-video-model' },
        message: '视频生成输入不能为空',
      },
      {
        name: 'invalid image urls',
        body: { model: 'demo-video-model', prompt: 'phase 2 video', image_urls: ['data:text/plain;base64,Zm9v'] },
        message: 'image_urls[0] 不是允许的图片链接格式',
      },
      {
        name: 'invalid audio',
        body: { model: 'demo-video-model', prompt: 'phase 2 video', input_audio: 'data:image/png;base64,AAAA' },
        message: 'input_audio 不是允许的音频链接格式',
      },
      {
        name: 'invalid duration',
        body: { model: 'demo-video-model', prompt: 'phase 2 video', duration: 'slow' },
        message: 'duration 必须为数字',
      },
    ];

    for (const item of cases) {
      const invalid = await requestJson(baseUrl, '/api/capabilities/video', {
        method: 'POST',
        body: JSON.stringify(item.body),
      });
      assert.equal(invalid.status, 400, item.name);
      assertEnvelopeShape(invalid.body);
      assert.equal(invalid.body.error.code, 'VALIDATION_ERROR', item.name);
      assert.equal(invalid.body.error.message, item.message, item.name);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP contract: capabilities video status route returns envelope-only payloads', async () => {
  const { server, baseUrl } = await createTestServer('capabilities-video-status');
  try {
    const { capabilitiesService } = await import('../src/modules/capabilities/capabilities.service.js');
    const originalGetVideoStatus = capabilitiesService.getVideoStatus;
    capabilitiesService.getVideoStatus = async (taskId) => ({
      status: 'succeeded',
      taskId,
      output: { video_url: 'https://example.com/video.mp4' },
    });

    try {
      const success = await requestJson(baseUrl, '/api/capabilities/video/task_contract_status');
      assert.equal(success.status, 200);
      assertEnvelopeShape(success.body);
      assert.equal(success.body.data.status, 'succeeded');
      assert.equal(success.body.data.taskId, 'task_contract_status');
      assert.equal(success.body.status, undefined);
    } finally {
      capabilitiesService.getVideoStatus = originalGetVideoStatus;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
