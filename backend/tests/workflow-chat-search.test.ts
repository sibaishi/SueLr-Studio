import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProjectModels } from '../src/engine/helpers/projectModels.ts';
import { executeChatMode } from '../src/engine/nodes/aiV3/chat.ts';
import { getProviderAdapter } from '../src/platform/providers/index.ts';

test('workflow chat requires both switches before requesting web search', async (t) => {
  const adapter = getProviderAdapter();
  const upstream = t.mock.method(
    adapter,
    'jsonRequest',
    async ({ endpoint, body }: Parameters<typeof adapter.jsonRequest>[0]) => {
      const payload = body as Record<string, unknown>;
      if (endpoint === '/v1/responses') {
        assert.deepEqual(payload.tools, [{ type: 'web_search' }]);
        assert.equal(payload.tool_choice, 'required');
        return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '联网回复' }] }] });
      }
      assert.equal(endpoint, '/v1/chat/completions');
      assert.equal(payload.tools, undefined);
      return Response.json({ choices: [{ message: { content: '普通回复' } }] });
    },
  );

  const model = 'test-chat';
  const run = (modelSearch: boolean, nodeSearch?: boolean) =>
    executeChatMode(
      '测试',
      [],
      { model, enableWebSearch: nodeSearch },
      {
        model,
        apiKey: 'test-key',
        baseUrl: 'https://example.com',
        endpoint: '/v1/chat/completions',
        workflowExecution: undefined,
        providerConfig: {},
        projectModels: normalizeProjectModels([{ modelId: model, type: 'chat', nativeWebSearch: modelSearch }]),
      },
      {},
      () => {},
    );

  await assert.rejects(run(false, true), { code: 'MODEL_WEB_SEARCH_DISABLED' });
  assert.equal(upstream.mock.callCount(), 0);
  assert.deepEqual(await run(false, false), { result: '普通回复' });
  assert.deepEqual(await run(true, false), { result: '普通回复' });
  assert.deepEqual(await run(true), { result: '普通回复' });
  assert.deepEqual(await run(true, true), { result: '联网回复' });
  assert.equal(upstream.mock.callCount(), 4);
});
