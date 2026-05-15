import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from '../src/modules/agent/agent-runtime.js';

function createSessionStore() {
  const sessions = new Map();
  return {
    create(session) {
      sessions.set(session.sessionId, session);
      return session;
    },
    update(sessionId, patch) {
      const current = sessions.get(sessionId) || { sessionId };
      const next = { ...current, ...patch };
      sessions.set(sessionId, next);
      return next;
    },
    get(sessionId) {
      return sessions.get(sessionId) || null;
    },
  };
}

function createRuntime(overrides = {}) {
  const imported = [];
  const memoryService = overrides.memoryService || {
    buildContext: () => '',
    list: () => [],
    import: (records) => {
      imported.push(...records);
      return records;
    },
  };

  const runtime = new AgentRuntime({
    capabilitiesService: overrides.capabilitiesService,
    profileService: overrides.profileService || {
      resolveProfile: () => ({
        id: 'default',
        instruction: 'You are helpful.',
        enabledTools: [],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'auto' },
      }),
    },
    memoryService,
    toolRegistry: overrides.toolRegistry || {
      toModelTools: () => [],
      execute: async () => {
        throw new Error('execute should not be called in this test');
      },
    },
    sessionStore: createSessionStore(),
    memoryStrategy: overrides.memoryStrategy,
  });

  return { runtime, imported };
}

test('AgentRuntime.run writes extracted memories after agent completion', async () => {
  let chatCallCount = 0;
  const { runtime, imported } = createRuntime({
    capabilitiesService: {
      async chat(body) {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          assert.equal(body.tools.length, 0);
          return {
            choices: [{ message: { role: 'assistant', content: '你好，我会记住你偏好中文回复。' } }],
          };
        }

        assert.equal(body.messages[0].role, 'system');
        return {
          choices: [{ message: { role: 'assistant', content: '["用户偏好中文回复"]' } }],
        };
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-memory',
    model: 'demo-model',
    messages: [{ role: 'user', content: '之后都用中文回复我。' }],
  });

  assert.equal(result.assistantMessage.content, '你好，我会记住你偏好中文回复。');
  assert.equal(result.memoryWrites.length, 1);
  assert.equal(result.memoryWrites[0].content, '用户偏好中文回复');
  assert.equal(result.memoryWrites[0].conversationId, 'conv-memory');
  assert.equal(imported.length, 1);
  assert.equal(chatCallCount, 2);
});

test('AgentRuntime.run returns token usage from provider usage when available', async () => {
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        return {
          choices: [{ message: { role: 'assistant', content: 'done' } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            total_tokens: 15,
          },
        };
      },
    },
    memoryStrategy: {
      isEnabled: () => false,
      writeMemories: async () => [],
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-token-usage',
    profileId: 'default',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(result.tokenUsage.source, 'provider');
  assert.equal(result.tokenUsage.promptTokens, 12);
  assert.equal(result.tokenUsage.completionTokens, 3);
  assert.equal(result.tokenUsage.totalTokens, 15);
  assert.equal(result.tokenUsage.compressionThreshold, 128000);
});

test('AgentRuntime.runStream writes extracted memories after streaming completion', async () => {
  let extractionCallCount = 0;
  const { runtime, imported } = createRuntime({
    capabilitiesService: {
      async chatStream() {
        return new Response(
          'data: {"choices":[{"delta":{"content":"记"}}]}\n\n'
          + 'data: {"choices":[{"delta":{"content":"住这个偏好"},"finish_reason":"stop"}]}\n\n'
          + 'data: [DONE]\n\n',
          {
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          },
        );
      },
      async chat() {
        extractionCallCount += 1;
        return {
          choices: [{ message: { role: 'assistant', content: '["用户喜欢分步骤说明"]' } }],
        };
      },
    },
  });

  const deltas = [];
  const result = await runtime.runStream({
    conversationId: 'conv-stream-memory',
    model: 'demo-model',
    messages: [{ role: 'user', content: '以后请分步骤说明。' }],
    handlers: {
      onMessageDelta: ({ delta }) => deltas.push(delta),
    },
  });

  assert.deepEqual(deltas, ['记', '住这个偏好']);
  assert.equal(result.assistantMessage.content, '记住这个偏好');
  assert.equal(result.memoryWrites.length, 1);
  assert.equal(result.memoryWrites[0].content, '用户喜欢分步骤说明');
  assert.equal(imported.length, 1);
  assert.equal(extractionCallCount, 1);
});

test('AgentRuntime.runStream uses generate_image tool result when final model response is empty', async () => {
  let chatCallCount = 0;
  let secondRoundToolContent = '';
  const completed = [];
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'image-profile',
        instruction: 'You are helpful.',
        enabledTools: ['generate_image'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'off' },
      }),
    },
    capabilitiesService: {
      async chatStream(body) {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return new Response(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tool-image-1","type":"function","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"draw a mountain\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
            + 'data: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            },
          );
        }

        secondRoundToolContent = body.messages.find((message) => message.role === 'tool')?.content || '';
        return new Response('data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      },
      async chat() {
        throw new Error('memory extraction should not run');
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generate an image',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (name, args) => {
        assert.equal(name, 'generate_image');
        assert.deepEqual(args, { prompt: 'draw a mountain' });
        return JSON.stringify({
          images: ['data:image/png;base64,' + 'A'.repeat(2000)],
          rawImages: ['data:image/png;base64,' + 'B'.repeat(2000)],
          rawData: [{ data: [{ b64_json: 'C'.repeat(2000) }] }],
          request: { model: 'demo-image-model', prompt: 'draw a mountain' },
        });
      },
    },
    memoryStrategy: {
      isEnabled: () => false,
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.runStream({
    conversationId: 'conv-image-tool-empty-final',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Generate an image.' }],
    handlers: {
      onMessageCompleted: (payload) => completed.push(payload),
    },
  });

  assert.equal(chatCallCount, 2);
  assert.equal(result.assistantMessage.content, '图片已生成。');
  assert.equal(completed[0].assistantMessage.content, '图片已生成。');
  assert.match(secondRoundToolContent, /"imageCount":1/);
  assert.doesNotMatch(secondRoundToolContent, /data:image|AAAA|BBBB|CCCC|base64/);
  assert.ok(secondRoundToolContent.length < 1000);
  assert.equal(result.toolTrace.length, 1);
  assert.equal(result.toolTrace[0].name, 'generate_image');
});

test('AgentRuntime.runStream passes the most recent conversation image to generate_image edits', async () => {
  let chatCallCount = 0;
  let receivedCurrentImages = null;
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'image-profile',
        instruction: 'You are helpful.',
        enabledTools: ['generate_image'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'off' },
      }),
    },
    capabilitiesService: {
      async chatStream() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return new Response(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tool-image-edit-1","type":"function","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"make this brighter\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
            + 'data: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            },
          );
        }

        return new Response('data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      },
      async chat() {
        throw new Error('memory extraction should not run');
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generate an image',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (name, args, ctx) => {
        assert.equal(name, 'generate_image');
        assert.deepEqual(args, { prompt: 'make this brighter' });
        receivedCurrentImages = ctx.currentUserImages;
        return JSON.stringify({
          images: ['/api/outputs/edited.png'],
          request: { model: 'demo-image-model', prompt: args.prompt, image: ctx.currentUserImages },
        });
      },
    },
    memoryStrategy: {
      isEnabled: () => false,
      async writeMemories() {
        return [];
      },
    },
  });

  await runtime.runStream({
    conversationId: 'conv-image-edit-recent-image',
    model: 'demo-model',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is the image.' },
          { type: 'image_url', image_url: { url: '/api/files/source.png' } },
        ],
      },
      { role: 'assistant', content: 'I can edit it.' },
      { role: 'user', content: 'Make this brighter.' },
    ],
  });

  assert.deepEqual(receivedCurrentImages, ['/api/files/source.png']);
});

test('AgentRuntime.runStream asks user to pick a model when generate_image is ambiguous and final model response is empty', async () => {
  let chatCallCount = 0;
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'image-profile',
        instruction: 'You are helpful.',
        enabledTools: ['generate_image'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'off' },
      }),
    },
    capabilitiesService: {
      async chatStream() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return new Response(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tool-image-1","type":"function","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"draw a mountain\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
            + 'data: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            },
          );
        }

        return new Response('data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      },
      async chat() {
        throw new Error('memory extraction should not run');
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generate an image',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async () => JSON.stringify({
        type: 'tool_needs_clarification',
        reason: 'multiple_image_models_available',
        candidates: [
          { model: 'image-a' },
          { model: 'image-b' },
        ],
      }),
    },
    memoryStrategy: {
      isEnabled: () => false,
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.runStream({
    conversationId: 'conv-image-tool-ambiguous-empty-final',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Generate an image.' }],
  });

  assert.equal(chatCallCount, 2);
  assert.equal(result.assistantMessage.content, '请选择要使用的图像模型：image-a、image-b');
});

test('AgentRuntime.run ignores object-like memory fragments from extraction output', async () => {
  let chatCallCount = 0;
  const { runtime, imported } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return {
            choices: [{ message: { role: 'assistant', content: '好的，我记住了。' } }],
          };
        }
        return {
          choices: [{ message: { role: 'assistant', content: '["{\\"preference\\":\\"中文回复\\"}"]' } }],
        };
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-invalid-memory',
    model: 'demo-model',
    messages: [{ role: 'user', content: '以后请用中文。' }],
  });

  assert.equal(result.memoryWrites.length, 0);
  assert.equal(imported.length, 0);
});

test('AgentRuntime.run avoids writing semantically duplicated memory items', async () => {
  let chatCallCount = 0;
  const existing = [
    {
      id: 'mem-existing-step',
      scope: 'conversation',
      source: 'chat',
      content: '用户要求回答分步骤',
      tags: [],
      importance: 1,
      createdAt: 1,
      updatedAt: 1,
      conversationId: 'conv-dedupe',
    },
  ];
  const imported = [];
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return {
            choices: [{ message: { role: 'assistant', content: '好的，我记住了。' } }],
          };
        }
        return {
          choices: [{ message: { role: 'assistant', content: '["用户要求答案尽量分步骤","用户偏好回答简洁"]' } }],
        };
      },
    },
    memoryService: {
      buildContext: () => '',
      list: () => existing,
      import: (records) => {
        imported.push(...records);
        return records;
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-dedupe',
    model: 'demo-model',
    messages: [{ role: 'user', content: '以后请分步骤，尽量简洁。' }],
  });

  assert.equal(result.memoryWrites.length, 1);
  assert.equal(result.memoryWrites[0].content, '用户偏好回答简洁');
  assert.equal(imported.length, 1);
});

test('AgentRuntime.run does not write workflow execution details as long-term memory', async () => {
  let chatCallCount = 0;
  const { runtime, imported } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return {
            choices: [{ message: { role: 'assistant', content: 'Workflow run finished.' } }],
          };
        }
        return {
          choices: [{ message: { role: 'assistant', content: '["workflow_execute should run Saved Workflow","runId run_123 completed today"]' } }],
        };
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-workflow-memory-write-policy',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Run Saved Workflow.' }],
  });

  assert.equal(result.memoryWrites.length, 0);
  assert.equal(imported.length, 0);
});

test('AgentRuntime.run does not auto-write saved workflow instructions as memory', async () => {
  let chatCallCount = 0;
  const { runtime, imported } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return {
            choices: [{ message: { role: 'assistant', content: '好的，我不会把工作流运行目标写入记忆。' } }],
          };
        }
        return {
          choices: [{ message: { role: 'assistant', content: '["用户希望下次运行 Saved Workflow，并使用 remembered prompt。"]' } }],
        };
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-workflow-memory-write-policy-cn',
    model: 'demo-model',
    messages: [{ role: 'user', content: '请记住，下次运行 Saved Workflow，并使用 remembered prompt。' }],
  });

  assert.equal(result.memoryWrites.length, 0);
  assert.equal(imported.length, 0);
});

test('AgentRuntime.run does not auto-write memories when memory_write is disabled', async () => {
  const { runtime, imported } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'read-only-memory-profile',
        instruction: 'You are helpful.',
        enabledTools: ['search_memory', 'get_current_time'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'auto' },
      }),
    },
    capabilitiesService: {
      async chat() {
        return {
          choices: [{ message: { role: 'assistant', content: 'I will answer normally.' } }],
        };
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-memory-write-disabled',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Please remember I prefer concise answers.' }],
  });

  assert.equal(result.memoryWrites.length, 0);
  assert.equal(imported.length, 0);
});
test('AgentRuntime.run supports workflow execution tool loops and returns the final assistant reply', async () => {
  let chatCallCount = 0;
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount === 1) {
          return {
            choices: [{
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{
                  id: 'tool-workflow-1',
                  type: 'function',
                  function: {
                    name: 'workflow_execute',
                    arguments: JSON.stringify({ workflowName: 'Saved Workflow' }),
                  },
                }],
              },
            }],
          };
        }

        return {
          choices: [{
            message: {
              role: 'assistant',
              content: 'Workflow finished. runId=run_workflow_1 status=completed.',
            },
          }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'workflow_execute',
          description: 'Execute a workflow',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (name, args) => {
        assert.equal(name, 'workflow_execute');
        assert.deepEqual(args, { workflowName: 'Saved Workflow' });
        return JSON.stringify({
          runId: 'run_workflow_1',
          workflowId: 'wf_saved',
          workflowName: 'Saved Workflow',
          status: 'completed',
          keyOutputs: [{ nodeId: 'output-1', nodeType: 'output', summary: 'content: hello' }],
        });
      },
    },
    memoryStrategy: {
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-workflow-tool',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Run the Saved Workflow for me.' }],
  });

  assert.equal(chatCallCount, 2);
  assert.equal(result.assistantMessage.content, 'Workflow finished. runId=run_workflow_1 status=completed.');
  assert.equal(result.toolTrace.length, 1);
  assert.equal(result.toolTrace[0].name, 'workflow_execute');
});

test('AgentRuntime.run does not inject memory context when workflow execution is available', async () => {
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'workflow-profile',
        instruction: 'You are helpful.',
        enabledTools: ['workflow_execute'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'auto' },
      }),
    },
    memoryService: {
      buildContext: () => {
        throw new Error('memory context should not be built for workflow-capable runs');
      },
      list: () => [],
      import: () => [],
    },
    capabilitiesService: {
      async chat(body) {
        assert.equal(body.messages[0].role, 'system');
        assert.equal(body.messages[0].content, 'You are helpful.');
        return {
          choices: [{ message: { role: 'assistant', content: 'Ready.' } }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'workflow_execute',
          description: 'Execute a workflow',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async () => {
        throw new Error('execute should not be called in this test');
      },
    },
    memoryStrategy: {
      isEnabled: () => true,
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-workflow-memory-boundary',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Run Saved Workflow.' }],
  });

  assert.equal(result.assistantMessage.content, 'Ready.');
});

test('AgentRuntime.run does not inject memory context when memory mode is off', async () => {
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'memory-off-profile',
        instruction: 'You are helpful.',
        enabledTools: ['get_current_time'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'off' },
      }),
    },
    memoryService: {
      buildContext: () => {
        throw new Error('memory context should not be built when memory mode is off');
      },
      list: () => [],
      import: () => [],
    },
    capabilitiesService: {
      async chat(body) {
        assert.equal(body.messages[0].role, 'system');
        assert.equal(body.messages[0].content, 'You are helpful.');
        return {
          choices: [{ message: { role: 'assistant', content: 'Memory is off.' } }],
        };
      },
    },
    memoryStrategy: {
      isEnabled: () => false,
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-memory-off',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Say hello.' }],
  });

  assert.equal(result.assistantMessage.content, 'Memory is off.');
});

test('AgentRuntime.run passes current user text to workflow tool guard', async () => {
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'tool-workflow-guard',
                type: 'function',
                function: {
                  name: 'workflow_execute',
                  arguments: JSON.stringify({ workflowName: 'Remembered Workflow' }),
                },
              }],
            },
          }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'workflow_execute',
          description: 'Execute a workflow',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (name, args, ctx) => {
        assert.equal(name, 'workflow_execute');
        assert.equal(args.workflowName, 'Remembered Workflow');
        assert.equal(ctx.currentUserText, 'Run the workflow.');
        assert.equal(ctx.conversationId, 'conv-workflow-guard');
        throw new Error('Workflow execution must be grounded in the current user request; memory or prior context cannot choose the workflow target.');
      },
    },
    memoryStrategy: {
      isEnabled: () => true,
      async writeMemories() {
        return [];
      },
    },
  });

  await assert.rejects(
    runtime.run({
      conversationId: 'conv-workflow-guard',
      model: 'demo-model',
      messages: [{ role: 'user', content: 'Run the workflow.' }],
    }),
    /current user request/i,
  );
});

test('AgentRuntime.runStream passes conversationId to tools', async () => {
  let receivedConversationId = '';
  let chatCallCount = 0;
  const { runtime } = createRuntime({
    profileService: {
      resolveProfile: () => ({
        id: 'memory-profile',
        instruction: 'You are helpful.',
        enabledTools: ['memory_write'],
        defaultModel: 'demo-model',
        behavior: { memoryMode: 'auto' },
      }),
    },
    capabilitiesService: {
      async chatStream() {
        chatCallCount += 1;
        if (chatCallCount > 1) {
          return new Response(
            'data: {"choices":[{"delta":{"content":"Saved."},"finish_reason":"stop"}]}\n\n'
            + 'data: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            },
          );
        }
        return new Response(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tool-memory-1","type":"function","function":{"name":"memory_write","arguments":"{\\"content\\":\\"User prefers concise answers.\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
          + 'data: [DONE]\n\n',
          {
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          },
        );
      },
      async chat() {
        return {
          choices: [{ message: { role: 'assistant', content: 'Saved.' } }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'memory_write',
          description: 'Write memory',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (_name, _args, ctx) => {
        receivedConversationId = ctx.conversationId;
        return JSON.stringify({ type: 'memory_write_result', status: 'written' });
      },
    },
    memoryStrategy: {
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.runStream({
    conversationId: 'conv-stream-tool-context',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Remember I prefer concise answers.' }],
  });

  assert.equal(receivedConversationId, 'conv-stream-tool-context');
  assert.equal(result.toolTrace[0].name, 'memory_write');
});

test('AgentRuntime.run passes text and images from multimodal user messages to tools', async () => {
  let chatCallCount = 0;
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        chatCallCount += 1;
        if (chatCallCount > 1) {
          return {
            choices: [{ message: { role: 'assistant', content: 'Edited.' } }],
          };
        }
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'tool-image-edit',
                type: 'function',
                function: {
                  name: 'generate_image',
                  arguments: JSON.stringify({ prompt: 'make it watercolor' }),
                },
              }],
            },
          }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [{
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generate an image',
          parameters: { type: 'object', properties: {} },
        },
      }],
      execute: async (name, args, ctx) => {
        assert.equal(name, 'generate_image');
        assert.equal(ctx.currentUserText, 'Please edit this image.');
        assert.deepEqual(ctx.currentUserImages, ['/api/files/source.png']);
        return JSON.stringify({ images: ['/api/outputs/result.png'] });
      },
    },
    memoryStrategy: {
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-multimodal-tool-context',
    model: 'demo-model',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Please edit this image.' },
        { type: 'image_url', image_url: { url: '/api/files/source.png' } },
      ],
    }],
  });

  assert.equal(result.toolTrace[0].name, 'generate_image');
});

test('AgentRuntime.run ignores malformed tool calls with empty names when content is present', async () => {
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: 'Plain text answer without using tools.',
              tool_calls: [{
                id: 'tool-invalid',
                type: 'function',
                function: {
                  name: '',
                  arguments: '{}',
                },
              }],
            },
          }],
        };
      },
    },
    toolRegistry: {
      toModelTools: () => [],
      execute: async () => {
        throw new Error('execute should not be called for invalid tool names');
      },
    },
    memoryStrategy: {
      async writeMemories() {
        return [];
      },
    },
  });

  const result = await runtime.run({
    conversationId: 'conv-invalid-tool-name',
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Say hello.' }],
  });

  assert.equal(result.assistantMessage.content, 'Plain text answer without using tools.');
  assert.equal(result.toolTrace.length, 0);
});

test('AgentRuntime.run throws a clear error for empty-name tool calls without content', async () => {
  const { runtime } = createRuntime({
    capabilitiesService: {
      async chat() {
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'tool-invalid',
                type: 'function',
                function: {
                  name: '',
                  arguments: '{}',
                },
              }],
            },
          }],
        };
      },
    },
    memoryStrategy: {
      async writeMemories() {
        return [];
      },
    },
  });

  await assert.rejects(
    runtime.run({
      conversationId: 'conv-invalid-empty-tool',
      model: 'demo-model',
      messages: [{ role: 'user', content: 'Use a tool.' }],
    }),
    /malformed tool calls without a tool name/i,
  );
});
