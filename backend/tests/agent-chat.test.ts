import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import test from 'node:test';
import { normalizeProjectModels } from '../src/engine/helpers/projectModels.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { getProviderAdapter } from '../src/platform/providers/index.ts';
import { createTestServer, requestJson } from './helpers/runtime-test.ts';

test('Agent forwards ordered conversation, visual references and selected Skills through the saved connection', async (t) => {
  const { server, baseUrl, root, restoreEnv } = (await createTestServer('agent-chat')) as {
    server: Server;
    baseUrl: string;
    root: string;
    restoreEnv: () => void;
  };
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  t.mock.method(settingsService, 'buildRuntimeConfig', () => ({
    configId: 'studio',
    configs: [{ id: 'studio' }],
    apiKey: 'saved-key',
    baseUrl: 'https://example.com',
    providerConfig: {},
    projectModels: normalizeProjectModels([{ modelId: 'chat-test', type: 'chat' }]),
  }));
  const messages = [
    { role: 'user', content: [{ type: 'text', text: '拟定视觉方向' }] },
    { role: 'assistant', content: '用暖色。' },
    {
      role: 'user',
      content: [
        { type: 'text', text: '根据参考图继续。' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
      ],
    },
  ];
  const adapter = getProviderAdapter();
  const upstream = t.mock.method(adapter, 'jsonRequest', async (request: Parameters<typeof adapter.jsonRequest>[0]) => {
    assert.equal(request.apiKey, 'saved-key');
    const body = request.body as { model: string; messages: { role: string; content: string }[] };
    assert.equal(body.model, 'chat-test');
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /我是弧光，SueLr Studio 里的创意搭档/);
    assert.match(body.messages[0].content, /优先考虑色彩对比/);
    assert.deepEqual(body.messages.slice(1), messages);
    return Response.json({ choices: [{ message: { content: '延续暖色，增加明暗对比。' } }] });
  });
  const request = (body: unknown) =>
    requestJson(baseUrl, '/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  const payload = { configId: 'studio', model: 'chat-test', messages, skills: ['优先考虑色彩对比'] };
  assert.equal((await request({ ...payload, apiKey: 'override' })).status, 400);
  assert.equal((await request({ ...payload, messages: messages.slice(1) })).status, 400);
  assert.equal((await request({ ...payload, configId: 'missing' })).status, 400);
  assert.equal(upstream.mock.callCount(), 0);
  const result = await request(payload);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { answer: '延续暖色，增加明暗对比。' });
  const operations = [{ kind: 'update', nodeId: 'prompt', text: '新提示词' }, { kind: 'run' }];
  let actionCalls = 0;
  upstream.mock.mockImplementation(async ({ body }) => {
    if (++actionCalls === 1) return Response.json({ choices: [{ message: { content: '请手动修改并运行。' } }] });
    assert.deepEqual((body as { tool_choice: unknown }).tool_choice, {
      type: 'function',
      function: { name: 'propose_canvas_changes' },
    });
    return Response.json({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: { name: 'propose_canvas_changes', arguments: JSON.stringify({ operations }) },
              },
            ],
          },
        },
      ],
    });
  });
  const action = await request({
    ...payload,
    canvasEnabled: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: '现在可以帮我把提示词放进去，再跑一遍吗？' }] }],
  });
  assert.equal(action.status, 200);
  assert.deepEqual(action.body.data.plan, { operations });
});
