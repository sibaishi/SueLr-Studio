// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `intelligence-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name) {
  const root = createStorageDir(name);
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  const { createApp } = await import(`../src/app/create-app.ts?test=${Date.now()}`);
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

test('intelligence routes expose read-only skills and local knowledge baseline', async () => {
  const { server, baseUrl } = await createTestServer('baseline');
  try {
    const skills = await requestJson(baseUrl, '/api/intelligence/skills');
    assert.equal(skills.status, 200);
    assertEnvelopeShape(skills.body);
    assert.deepEqual(
      skills.body.data.map((skill) => skill.id),
      [
        'knowledge.search',
        'knowledge.write',
        'knowledge.importLegacyMemory',
        'knowledge.rebuildSeeds',
        'knowledge.linkAsset',
        'knowledge.summarizeRun',
        'knowledge.extractPreference',
        'knowledge.promoteToTemplate',
        'workflow.list',
        'team.list',
        'team.run',
        'workflow.inspect',
        'workflow.edit',
        'workflow.applyDraft',
        'model.list',
        'brief.parse',
        'workflow.createDraft',
        'workflow.validate',
        'workflow.suggestInputs',
        'workflow.execute',
        'workflow.diagnose',
        'workflow.summarizeRun',
        'image.generate',
        'image.edit',
        'image.compare',
        'video.generate',
        'copy.write',
        'prompt.optimize',
        'result.inspect',
        'asset.package',
      ],
    );
    assert.equal(skills.body.data.find((skill) => skill.id === 'workflow.createDraft')?.sideEffect, 'writeDraft');
    assert.equal(skills.body.data.find((skill) => skill.id === 'team.run')?.sideEffect, 'writeDraft');
    assert.equal(skills.body.data.find((skill) => skill.id === 'workflow.execute')?.requiresApproval, true);
    assert.equal(skills.body.data.find((skill) => skill.id === 'workflow.applyDraft')?.requiresApproval, true);
    assert.equal(skills.body.data.find((skill) => skill.id === 'knowledge.write')?.requiresApproval, true);
    assert.equal(
      skills.body.data
        .filter(
          (skill) =>
            ![
              'workflow.applyDraft',
              'workflow.execute',
              'knowledge.write',
              'knowledge.promoteToTemplate',
              'image.generate',
              'image.edit',
              'video.generate',
            ].includes(skill.id),
        )
        .every((skill) => skill.requiresApproval === false),
      true,
    );

    const knowledge = await requestJson(baseUrl, '/api/intelligence/knowledge');
    assert.equal(knowledge.status, 200);
    assertEnvelopeShape(knowledge.body);
    assert.equal(knowledge.body.data.storage, 'local-json');
    assert.equal(knowledge.body.data.scope, 'local');
    assert.equal(Array.isArray(knowledge.body.data.categories), true);
    assert.equal(knowledge.body.data.categories.length, 8);
    assert.equal(
      knowledge.body.data.files.every((file) => file.count === 0),
      true,
    );
    assert.equal(knowledge.body.data.governance.runKnowledgeRequiresTrace, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft endpoint compiles a preview-only ecommerce image workflow', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个商品图生成工作流，输入产品图和一句卖点，输出 6 张不同风格的电商主图。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.intent.domain, 'ecommerce-image');
    assert.equal(response.body.data.intent.outputCount, 6);
    assert.equal(response.body.data.knowledgeContext.source, 'local-json');
    assert.equal(
      response.body.data.knowledgeContext.items.some((item) => item.source.kind === 'system_seed'),
      true,
    );
    assert.equal(
      response.body.data.draft.stages.some((stage) => stage.nodeType === 'aiV3'),
      true,
    );
    assert.equal(response.body.data.workflow.name, '电商图片生成工作流草稿');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'io', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'),
      false,
    );
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'image_gen').data.n, 6);
    assert.equal(response.body.data.workflow.metadata.intentDomain, 'ecommerce-image');
    assert.equal(response.body.data.validation.valid, true);
    assert.equal(
      response.body.data.validation.issues.some(
        (issue) => issue.code === 'MODEL_MISSING' && issue.severity === 'warning',
      ),
      true,
    );
    assert.equal(response.body.data.approvalsRequired.includes('executeWorkflow'), true);

    const workflows = await requestJson(baseUrl, '/api/workflows');
    assert.equal(workflows.status, 200);
    assert.equal(
      workflows.body.data.some((workflow) => workflow.id === response.body.data.workflow.id),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft preserves agent planner model context', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-agent-context');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个商品图生成工作流，输入产品图和一句卖点，输出 3 张电商主图。',
        context: {
          agent: {
            plannerModel: {
              id: 'planner-chat-1',
              modelId: 'gpt-5.5',
              configId: 'provider-1',
              configName: '主力对话模型',
              label: 'gpt-5.5 · 主力对话模型',
            },
          },
        },
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.deepEqual(response.body.data.agentContext.plannerModel, {
      id: 'planner-chat-1',
      modelId: 'gpt-5.5',
      configId: 'provider-1',
      configName: '主力对话模型',
      label: 'gpt-5.5 · 主力对话模型',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent planner normalizes an LLM JSON plan into a governed tool plan', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  let plannerMessages = [];
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [
            {
              id: 'planner-model',
              modelId: 'planner-model',
              enabled: true,
              type: 'chat',
              endpointMode: 'category',
              endpointCategory: 'chat',
              customEndpoint: '',
              configured: true,
            },
          ],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [
            {
              id: 'seed_ai_chat',
              title: 'AI Chat 节点',
              category: 'workflow-knowledge',
              content: 'aiChat 用于对话、问答、摘要、改写和文本生成。',
              structured: { nodeType: 'aiV3' },
              source: { kind: 'system_seed' },
            },
          ],
        };
      },
    },
    async chatCompletion(request) {
      plannerMessages = request.messages;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '调用工作流工具生成客服问答草案',
                    toolName: 'workflow.createDraft',
                    toolInput: { input: '客服问答工作流，保存文本' },
                    reasoningSummary: '用户明确要求搭建工作流。',
                    warnings: ['需要用户后续确认模型参数'],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我做客服问答工作流',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'llm');
  assert.equal(plan.toolName, 'workflow.createDraft');
  assert.equal(plan.toolInput.input, '客服问答工作流，保存文本');
  assert.equal(plan.warnings[0], '需要用户后续确认模型参数');
  assert.equal(plan.knowledgeContext.items[0].nodeType, 'aiV3');
  assert.match(plannerMessages[1].content, /本地知识库上下文/);
  assert.match(plannerMessages[1].content, /AI Chat 节点/);
});

test('agent planner falls back to local tool plan when LLM output is unusable', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [
            {
              id: 'planner-model',
              modelId: 'planner-model',
              enabled: true,
              type: 'chat',
              endpointMode: 'category',
              endpointCategory: 'chat',
              customEndpoint: '',
              configured: true,
            },
          ],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '无法处理' } }] };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我做客服问答工作流',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'local-fallback');
  assert.equal(plan.toolName, 'workflow.createDraft');
  assert.equal(plan.toolInput.input, '帮我做客服问答工作流');
});

test('agent planner keeps selected image and video models on normalized production plans', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'image.generate',
            title: '图片生成',
            description: '生成单张或少量图片。',
            sideEffect: 'execute',
            requiresApproval: true,
            inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '准备生成图片',
                    toolName: 'image.generate',
                    toolInput: { prompt: '一只猫的 1:1 实拍照片', ratio: '1:1' },
                    reasoningSummary: '用户明确要求单张图片。',
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我生成一只猫的 1:1 实拍照片',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'planner-config',
      label: 'planner-model · Default',
    },
    imageModel: {
      id: 'image-model',
      modelId: 'gpt-image-1',
      configId: 'image-config',
      label: 'gpt-image-1 · Image',
    },
    videoModel: {
      id: 'video-model',
      modelId: 'seedance2.0',
      configId: 'video-config',
      label: 'seedance2.0 · Video',
    },
    context: {},
  });

  assert.equal(plan.toolName, 'image.generate');
  assert.equal(plan.imageModel?.modelId, 'gpt-image-1');
  assert.equal(plan.imageModel?.configId, 'image-config');
  assert.equal(plan.videoModel?.modelId, 'seedance2.0');
  assert.equal(plan.videoModel?.configId, 'video-config');
});

test('agent planner keeps selected image and video models on fallback production plans', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'video.generate',
            title: '视频生成',
            description: '生成短视频。',
            sideEffect: 'execute',
            requiresApproval: true,
            inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '无法处理' } }] };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我生成一个 16:9 的猫咪奔跑短视频',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'planner-config',
      label: 'planner-model · Default',
    },
    imageModel: {
      id: 'image-model',
      modelId: 'gpt-image-1',
      configId: 'image-config',
      label: 'gpt-image-1 · Image',
    },
    videoModel: {
      id: 'video-model',
      modelId: 'seedance2.0',
      configId: 'video-config',
      label: 'seedance2.0 · Video',
    },
    context: {},
  });

  assert.equal(plan.source, 'local-fallback');
  assert.equal(plan.toolName, 'video.generate');
  assert.equal(plan.videoModel?.modelId, 'seedance2.0');
  assert.equal(plan.videoModel?.configId, 'video-config');
  assert.equal(plan.imageModel?.modelId, 'gpt-image-1');
  assert.equal(plan.imageModel?.configId, 'image-config');
});

test('agent planner falls back to copy.write for single-copy requests when LLM output is unusable', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'copy.write',
            title: '文案生成',
            description: '生成文案。',
            sideEffect: 'execute',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
            outputSchema: {},
          },
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '无法处理' } }] };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我生成一句保温杯广告语',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'local-fallback');
  assert.equal(plan.toolName, 'copy.write');
  assert.equal(plan.toolInput.prompt, '帮我生成一句保温杯广告语');
});

test('agent planner falls back to prompt.optimize for prompt-optimization requests when LLM output is unusable', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'prompt.optimize',
            title: '提示词优化',
            description: '优化提示词。',
            sideEffect: 'suggest',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
            outputSchema: {},
          },
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '无法处理' } }] };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '帮我优化这个图片提示词，让它更适合写实摄影',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'local-fallback');
  assert.equal(plan.toolName, 'prompt.optimize');
  assert.equal(plan.toolInput.prompt, '帮我优化这个图片提示词，让它更适合写实摄影');
  assert.equal(plan.toolInput.target, 'image');
});

test('agent planner can return a normal chat response without workflow tool use', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [],
        };
      },
    },
    async chatCompletion(request) {
      assert.match(request.messages[0].content, /chat\.respond/);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '解释当前阶段',
                    toolName: 'chat.respond',
                    toolInput: { response: '当前阶段是在验证 Agent 是否能区分普通对话和工作流工具调用。' },
                    reasoningSummary: '用户在询问说明，不需要创建工作流。',
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '现在这个功能是什么意思？',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'llm');
  assert.equal(plan.toolName, 'chat.respond');
  assert.match(plan.toolInput.response, /普通对话和工作流工具调用/);
});

test('agent planner keeps original task when LLM returns prompt-template text as tool input', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'workflow.createDraft',
            title: '创建工作流草案',
            description: '生成可预览的工作流草案 JSON。',
            sideEffect: 'writeDraft',
            requiresApproval: false,
            inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' } } },
            outputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {
        return { status: 'rebuilt' };
      },
      search() {
        return {
          source: 'local-json',
          items: [
            {
              id: 'seed_video_gen',
              title: 'Video Gen 节点',
              category: 'workflow-knowledge',
              content: '生成分镜图、故事板图片、分镜脚本或镜头文案不应该使用 videoGen。',
              structured: { nodeType: 'aiV3' },
              source: { kind: 'system_seed' },
            },
          ],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '规划分镜图工作流',
                    toolName: 'workflow.createDraft',
                    toolInput: {
                      input:
                        '你是专业提示词工程师。请根据以下需求生成提示词，必须输出 JSON，不要输出解释，输出格式包含 prompt、negativePrompt、style。',
                    },
                    reasoningSummary: '参考知识判断为分镜图图片生成任务。',
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const originalInput = '帮我生成 6 格分镜图，画面是一个咖啡广告从清晨到夜晚的故事板。';
  const plan = await service.createPlan({
    input: originalInput,
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'default',
      label: 'planner-model · Default',
    },
    context: {},
  });

  assert.equal(plan.source, 'llm');
  assert.equal(plan.toolInput.input, originalInput);
  assert.equal(
    plan.warnings.some((warning) => warning.includes('疑似提示词模板')),
    true,
  );
  assert.equal(plan.knowledgeContext.items[0].nodeType, 'aiV3');
});

test('agent planner uses the current page workflow when planning a governed execution', async () => {
  const { AgentPlannerService } = await import(
    `../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`
  );
  const service = new AgentPlannerService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    skills: {
      list() {
        return [
          {
            id: 'workflow.execute',
            title: '执行已保存工作流',
            description: '执行当前工作流',
            sideEffect: 'execute',
            requiresApproval: true,
            inputSchema: {},
          },
        ];
      },
    },
    knowledge: {
      rebuildSeedKnowledge() {},
      search() {
        return { source: 'local-json', items: [] };
      },
    },
    async chatCompletion() {
      return {
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '运行当前工作流',
                    toolName: 'workflow.execute',
                    toolInput: { workflowId: 'wf_llm_hallucinated' },
                    reasoningSummary: '用户要求运行当前工作流。',
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const plan = await service.createPlan({
    input: '运行当前工作流',
    plannerModel: {
      id: 'planner-model',
      modelId: 'planner-model',
      configId: 'test-config',
      label: 'planner-model · Test',
    },
    context: { workflowId: 'wf_current_page', workflowName: '当前页面工作流' },
  });

  assert.equal(plan.toolName, 'workflow.execute');
  assert.deepEqual(plan.toolInput, {
    workflowId: 'wf_current_page',
    workflowName: '当前页面工作流',
  });
});

test('agent runner executes planner-selected workflow tool and records a trace', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan(input) {
        calls.push(['planner', input.input]);
        return {
          id: 'plan_test',
          source: 'llm',
          plannerModel,
          summary: '调用工作流工具',
          toolName: 'workflow.createDraft',
          toolInput: { input: '客服问答工作流，保存文本' },
          reasoningSummary: '用户需要搭建工作流。',
          warnings: [],
          knowledgeContext: {
            source: 'local-json',
            items: [],
          },
        };
      },
    },
    skills: {
      get(id) {
        assert.equal(id, 'workflow.createDraft');
        return { id, requiresApproval: false };
      },
      async run(id, input) {
        calls.push(['skill', id, input]);
        return {
          skillId: id,
          output: {
            intent: { domain: 'chat-text' },
            workflow: { nodes: [{ type: 'io' }, { type: 'aiV3' }] },
            agentContext: { plannerModel: input.context.agent.plannerModel },
          },
        };
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return {
          id: 'irun_agent_test',
          status: 'completed',
          mode: input.mode,
          requestedSkills: input.requestedSkills,
          skillResults: input.skillResults,
        };
      },
    },
  });

  const result = await runner.run({
    input: '帮我做客服问答工作流',
    plannerModel,
    context: {},
  });

  assert.equal(result.plan.toolName, 'workflow.createDraft');
  assert.equal(result.trace.mode, 'agent');
  assert.deepEqual(result.trace.requestedSkills, ['workflow.createDraft']);
  assert.equal(result.toolResults[0].skillId, 'workflow.createDraft');
  assert.equal(result.workflowDraft.intent.domain, 'chat-text');
  assert.deepEqual(result.workflowDraft.agentContext.plannerModel, plannerModel);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['planner', 'skill', 'trace'],
  );
});

test('agent runner returns normal chat response without calling workflow skills', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan(input) {
        calls.push(['planner', input.input]);
        return {
          id: 'plan_chat_test',
          source: 'llm',
          plannerModel,
          summary: '普通对话回复',
          toolName: 'chat.respond',
          toolInput: { input: input.input, response: '这是普通对话，不需要生成工作流。' },
          reasoningSummary: '用户没有要求创建工作流。',
          warnings: [],
          knowledgeContext: {
            source: 'local-json',
            items: [],
          },
        };
      },
    },
    skills: {
      get() {
        calls.push(['skill-get']);
        throw new Error('chat response should not read skill registry');
      },
      async run() {
        calls.push(['skill-run']);
        throw new Error('chat response should not run skill');
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return {
          id: 'irun_agent_chat_test',
          status: 'completed',
          mode: input.mode,
          requestedSkills: input.requestedSkills,
          skillResults: input.skillResults,
        };
      },
    },
  });

  const result = await runner.run({
    input: '你解释一下现在是什么阶段',
    plannerModel,
    context: {},
  });

  assert.equal(result.plan.toolName, 'chat.respond');
  assert.equal(result.response, '这是普通对话，不需要生成工作流。');
  assert.equal(result.workflowDraft, null);
  assert.deepEqual(result.trace.requestedSkills, []);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['planner', 'trace'],
  );
});

test('agent runner returns a pending approval before executing a governed workflow tool', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        return {
          id: 'plan_execute_test',
          source: 'llm',
          plannerModel,
          summary: '准备运行当前工作流',
          toolName: 'workflow.execute',
          toolInput: { workflowId: 'wf_agent_execute' },
          reasoningSummary: '用户明确要求运行当前工作流。',
          warnings: [],
          knowledgeContext: { source: 'local-json', items: [] },
        };
      },
    },
    skills: {
      get(id) {
        calls.push(['get', id]);
        return { id, requiresApproval: true };
      },
      async run(id, input) {
        calls.push(['run', id, input]);
        if (id === 'workflow.suggestInputs') {
          return {
            skillId: id,
            output: {
              workflow: {
                id: 'wf_agent_execute',
                name: '当前工作流',
                nodeCount: 2,
                edgeCount: 1,
              },
              requiredInputs: [
                {
                  nodeId: 'prompt',
                  nodeType: 'io',
                  kind: 'text',
                  label: '提示词',
                  aliases: ['prompt', 'io1'],
                  currentValue: '默认输入',
                },
              ],
            },
          };
        }
        throw new Error('tool must not execute before approval');
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return { id: 'irun_pending', ...input };
      },
    },
  });

  const result = await runner.run({
    input: '运行当前工作流',
    plannerModel,
    context: { workflowId: 'wf_agent_execute' },
  });

  assert.equal(result.approvalRequired, true);
  assert.match(result.pendingApproval.id, /^approval_/);
  assert.equal(result.pendingApproval.toolName, 'workflow.execute');
  assert.deepEqual(result.pendingApproval.toolInput, {
    workflowId: 'wf_agent_execute',
    workflow: {
      id: 'wf_agent_execute',
      name: '当前工作流',
      nodeCount: 2,
      edgeCount: 1,
    },
    requiredInputs: [
      {
        nodeId: 'prompt',
        nodeType: 'io',
        kind: 'text',
        label: '提示词',
        aliases: ['prompt', 'io1'],
        currentValue: '默认输入',
      },
    ],
    inputs: {},
  });
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['get', 'run', 'trace'],
  );
});

test('agent runner executes an approved workflow tool without replanning', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        calls.push(['planner']);
        return {
          id: 'plan_execute_test',
          source: 'llm',
          plannerModel,
          summary: '准备运行当前工作流',
          toolName: 'workflow.execute',
          toolInput: { workflowId: 'wf_agent_execute' },
          reasoningSummary: '用户明确要求运行当前工作流。',
          warnings: [],
          knowledgeContext: { source: 'local-json', items: [] },
        };
      },
    },
    skills: {
      get(id) {
        calls.push(['get', id]);
        return { id, requiresApproval: true };
      },
      async run(id, input) {
        calls.push(['run', id, input]);
        if (id === 'workflow.suggestInputs') {
          return {
            skillId: id,
            output: {
              workflow: {
                id: 'wf_agent_execute',
                name: '当前工作流',
                nodeCount: 2,
                edgeCount: 1,
              },
              requiredInputs: [
                {
                  nodeId: 'prompt',
                  nodeType: 'io',
                  kind: 'text',
                  label: '提示词',
                  aliases: ['prompt', 'io1'],
                  currentValue: '默认输入',
                },
              ],
            },
          };
        }
        return { skillId: id, output: { run: { summary: '工作流已完成。' } } };
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return { id: 'irun_approved', ...input };
      },
    },
  });

  const pending = await runner.run({
    input: '运行当前工作流',
    plannerModel,
    context: { workflowId: 'wf_agent_execute' },
  });
  calls.length = 0;

  const result = await runner.run({
    input: '运行当前工作流',
    plannerModel,
    context: { workflowId: 'wf_agent_execute' },
    approval: {
      id: pending.pendingApproval.id,
      toolName: 'workflow.execute',
      toolInput: {
        workflowId: 'wf_client_tampered',
        inputs: {
          prompt: '新的执行输入',
        },
      },
      summary: '准备运行当前工作流',
    },
  });

  assert.equal(result.plan.source, 'user-approved');
  assert.equal(result.approvalRequired, false);
  assert.equal(result.response, '工作流已完成。');
  assert.deepEqual(calls[1], [
    'run',
    'workflow.execute',
    {
      workflowId: 'wf_agent_execute',
      inputs: {
        prompt: '新的执行输入',
      },
      confirmed: true,
    },
  ]);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['get', 'run', 'trace'],
  );
});

test('agent runner previews workflow.applyDraft before requesting approval', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const workflowSnapshot = {
    id: 'wf_edit_preview',
    name: '当前画布工作流',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [],
    edges: [],
    settings: {},
  };
  const patch = {
    id: 'patch_preview',
    workflowId: 'wf_edit_preview',
    workflowName: '当前画布工作流',
    instruction: '把这个工作流改成生成 6 张图',
    summary: '已生成 1 项可预览修改。',
    baseSignature: 'sig_base',
    approvalsRequired: ['applyDraft'],
    warnings: [],
    operations: [{ type: 'updateNodeData', nodeId: 'image_gen', field: 'n', from: 2, to: 6, summary: '调整数量' }],
    workflow: workflowSnapshot,
    validation: { valid: true, issues: [] },
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        return {
          id: 'plan_apply_patch',
          source: 'llm',
          plannerModel,
          summary: '准备应用当前工作流修改草案',
          toolName: 'workflow.applyDraft',
          toolInput: {
            workflowId: 'wf_edit_preview',
            workflowSnapshot,
            patch,
          },
          reasoningSummary: '用户要求应用当前修改草案。',
          warnings: [],
          knowledgeContext: { source: 'local-json', items: [] },
        };
      },
    },
    skills: {
      get(id) {
        calls.push(['get', id]);
        return { id, requiresApproval: true };
      },
      async run(id, input) {
        calls.push(['run', id, input]);
        return {
          skillId: id,
          output: {
            approvalRequired: true,
            message: '应用工作流修改草案需要用户确认。',
            workflow: { id: 'wf_edit_preview', name: '当前画布工作流', signature: 'sig_base' },
            patch,
          },
        };
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return { id: 'irun_apply_pending', ...input };
      },
    },
  });

  const result = await runner.run({
    input: '应用当前修改草案',
    plannerModel,
    context: { workflowId: 'wf_edit_preview', workflowSnapshot, workflowEditPatch: patch },
  });

  assert.equal(result.approvalRequired, true);
  assert.equal(result.pendingApproval.toolName, 'workflow.applyDraft');
  assert.equal(result.toolResults[0].output.patch.id, 'patch_preview');
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['get', 'run', 'trace'],
  );
});

test('agent runner reuses approval but refreshes workflowSnapshot for workflow.applyDraft', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const originalSnapshot = {
    id: 'wf_edit_apply',
    name: '当前画布工作流',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: 'image_gen', type: 'aiV3', position: { x: 0, y: 0 }, data: { n: 2 } }],
    edges: [],
    settings: {},
  };
  const refreshedSnapshot = {
    ...originalSnapshot,
    nodes: [{ id: 'image_gen', type: 'aiV3', position: { x: 0, y: 0 }, data: { n: 3 } }],
  };
  const patch = {
    id: 'patch_apply',
    workflowId: 'wf_edit_apply',
    workflowName: '当前画布工作流',
    instruction: '把这个工作流改成生成 6 张图',
    summary: '已生成 1 项可预览修改。',
    baseSignature: 'sig_base',
    approvalsRequired: ['applyDraft'],
    warnings: [],
    operations: [{ type: 'updateNodeData', nodeId: 'image_gen', field: 'n', from: 2, to: 6, summary: '调整数量' }],
    workflow: {
      ...originalSnapshot,
      nodes: [{ id: 'image_gen', type: 'aiV3', position: { x: 0, y: 0 }, data: { n: 6 } }],
    },
    validation: { valid: true, issues: [] },
  };
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        return {
          id: 'plan_apply_patch',
          source: 'llm',
          plannerModel,
          summary: '准备应用当前工作流修改草案',
          toolName: 'workflow.applyDraft',
          toolInput: {
            workflowId: 'wf_edit_apply',
            workflowSnapshot: originalSnapshot,
            patch,
          },
          reasoningSummary: '用户要求应用当前修改草案。',
          warnings: [],
          knowledgeContext: { source: 'local-json', items: [] },
        };
      },
    },
    skills: {
      get(id) {
        calls.push(['get', id]);
        return { id, requiresApproval: true };
      },
      async run(id, input) {
        calls.push(['run', id, input]);
        return {
          skillId: id,
          output: {
            approvalRequired: input.confirmed !== true,
            applied: input.confirmed === true,
            message: input.confirmed === true ? '已应用修改草案。' : '应用工作流修改草案需要用户确认。',
            patch,
            workflow: patch.workflow,
          },
        };
      },
    },
    traces: {
      create(input) {
        calls.push(['trace', input.mode, input.requestedSkills]);
        return { id: 'irun_apply', ...input };
      },
    },
  });

  const pending = await runner.run({
    input: '应用当前修改草案',
    plannerModel,
    context: { workflowId: 'wf_edit_apply', workflowSnapshot: originalSnapshot, workflowEditPatch: patch },
  });
  calls.length = 0;

  const result = await runner.run({
    input: '确认应用当前修改草案',
    plannerModel,
    approval: {
      id: pending.pendingApproval.id,
      toolName: 'workflow.applyDraft',
      toolInput: {
        workflowSnapshot: refreshedSnapshot,
      },
    },
  });

  assert.equal(result.plan.source, 'user-approved');
  assert.equal(result.approvalRequired, false);
  assert.equal(result.toolResults[0].output.applied, true);
  assert.equal(calls[1][1], 'workflow.applyDraft');
  assert.deepEqual(calls[1][2].workflowSnapshot, refreshedSnapshot);
  assert.equal(calls[1][2].confirmed, true);
});

test('agent runner rejects forged workflow tool approvals', async () => {
  const { AgentRunner } = await import(`../src/modules/intelligence/runtime/agent-runner.ts?test=${Date.now()}`);
  const plannerModel = {
    id: 'planner-model',
    modelId: 'planner-model',
    configId: 'test-config',
    label: 'planner-model · Test',
  };
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        throw new Error('forged approvals must not invoke the planner');
      },
    },
  });

  await assert.rejects(
    runner.run({
      input: '运行当前工作流',
      plannerModel,
      context: { workflowId: 'wf_agent_execute' },
      approval: {
        id: 'approval_forged',
        toolName: 'workflow.execute',
        toolInput: { workflowId: 'wf_agent_execute' },
      },
    }),
    (error) => error?.code === 'AGENT_TOOL_APPROVAL_INVALID',
  );
});

test('workflow architect compiles an LLM DSL into a validated workflow', async () => {
  const { WorkflowArchitectService } = await import(
    `../src/modules/intelligence/workflow-builder/workflow-architect.service.ts?test=${Date.now()}`
  );
  const intent = {
    id: 'intent_architect_test',
    sourceText: 'Create a multi-branch ecommerce asset workflow with 4 storyboard shots',
    name: 'Architect test',
    goal: 'Create a multi-branch ecommerce asset workflow with 4 storyboard shots',
    domain: 'ecommerce-image',
    inputs: [],
    outputCount: 4,
    requiresImageInput: true,
    requiresTextInput: true,
    requiresVideoInput: false,
    requiresAudioInput: false,
  };
  const draft = {
    id: 'draft_architect_test',
    name: 'Architect test',
    description: 'Architect test draft',
    intentId: intent.id,
    stages: [{ id: 'image', label: 'Image', nodeType: 'aiV3', purpose: 'Generate image', knowledgeIds: [] }],
    approvalsRequired: ['applyDraft', 'executeWorkflow'],
    knowledgeInfluences: [],
  };
  const service = new WorkflowArchitectService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    async chatCompletion(request) {
      assert.match(request.messages[0].content, /Workflow Architect/);
      assert.match(request.messages[1].content, /iterateRun/);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    name: 'LLM designed asset workflow',
                    description: 'A governed DSL workflow',
                    nodes: [
                      { id: 'brief', type: 'io', data: { content: 'asset brief' }, position: { x: 80, y: 120 } },
                      { id: 'reference', type: 'io', data: {}, position: { x: 80, y: 320 } },
                      {
                        id: 'planner',
                        type: 'aiV3',
        data: { mode: 'chat',
                          systemPrompt:
                            'Split the request into main image prompt and storyboard shots. Output storyboard shots one per line with no explanation.',
                        },
                        position: { x: 440, y: 160 },
                      },
                      {
                        id: 'split',
                        type: 'textSplit',
                        data: { separator: '\n', outputCount: 4 },
                        position: { x: 800, y: 260 },
                      },
                      { id: 'iterate', type: 'iterateRun', data: {}, position: { x: 1160, y: 260 } },
                      { id: 'mainImage', type: 'aiV3', data: { mode: 'image', n: 2, ratio: '1:1' }, position: { x: 800, y: 40 } },
                      {
                        id: 'shotImage',
                        type: 'aiV3',
        data: { mode: 'image', n: 1, ratio: '16:9' },
                        position: { x: 1520, y: 260 },
                      },
                      {
                        id: 'mainSave',
                        type: 'io',
                        data: { filenamePrefix: 'main' },
                        position: { x: 1160, y: 40 },
                      },
                      {
                        id: 'shotSave',
                        type: 'io',
                        data: { filenamePrefix: 'shot' },
                        position: { x: 1880, y: 260 },
                      },
                      { id: 'result', type: 'io', data: {}, position: { x: 2240, y: 160 } },
                    ],
                    edges: [
                      { source: 'brief', sourceHandle: 'result', target: 'planner', targetHandle: 'input' },
                      { source: 'reference', sourceHandle: 'result', target: 'planner', targetHandle: 'input' },
                      { source: 'planner', sourceHandle: 'result', target: 'mainImage', targetHandle: 'input' },
                      { source: 'reference', sourceHandle: 'result', target: 'mainImage', targetHandle: 'input' },
                      { source: 'planner', sourceHandle: 'result', target: 'split', targetHandle: 'text' },
                      { source: 'split', sourceHandle: 'part1', target: 'iterate', targetHandle: 'item1' },
                      { source: 'split', sourceHandle: 'part2', target: 'iterate', targetHandle: 'item2' },
                      { source: 'split', sourceHandle: 'part3', target: 'iterate', targetHandle: 'item3' },
                      { source: 'split', sourceHandle: 'part4', target: 'iterate', targetHandle: 'item4' },
                      { source: 'iterate', sourceHandle: 'text', target: 'shotImage', targetHandle: 'input' },
                      { source: 'mainImage', sourceHandle: 'result', target: 'mainSave', targetHandle: 'input' },
                      { source: 'shotImage', sourceHandle: 'result', target: 'shotSave', targetHandle: 'input' },
                      { source: 'mainSave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
                      { source: 'shotSave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
                    ],
                    settings: { workflowExecution: { enabled: true, maxConcurrency: 4 } },
                    reasoningSummary: 'Designed as a planner branch plus parallel generated asset branches.',
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const result = await service.tryCreateWorkflow(
    {
      input: intent.sourceText,
      plannerModel: undefined,
      context: {
        agent: {
          plannerModel: {
            id: 'planner-model',
            modelId: 'planner-model',
            configId: 'default',
            label: 'planner-model',
          },
        },
      },
    },
    intent,
    draft,
  );

  assert.equal(result.attempt.used, true);
  assert.equal(result.workflow.metadata.source, 'intelligence.workflowArchitectDsl');
  assert.equal(
    result.workflow.nodes.some((node) => node.type === 'iterateRun'),
    true,
  );
  assert.equal(result.workflow.nodes.find((node) => node.id === 'iterate').data.inputCount, 4);
  assert.equal(result.workflow.settings.workflowExecution.enabled, true);
});

test('workflow architect falls back when LLM DSL is invalid', async () => {
  const { WorkflowArchitectService } = await import(
    `../src/modules/intelligence/workflow-builder/workflow-architect.service.ts?test=${Date.now()}`
  );
  const intent = {
    id: 'intent_architect_invalid',
    sourceText: 'Create a workflow',
    name: 'Invalid architect test',
    goal: 'Create a workflow',
    domain: 'generic-image',
    inputs: [],
    outputCount: 1,
    requiresImageInput: false,
    requiresTextInput: true,
    requiresVideoInput: false,
    requiresAudioInput: false,
  };
  const draft = {
    id: 'draft_architect_invalid',
    name: 'Invalid architect test',
    description: 'Invalid architect test draft',
    intentId: intent.id,
    stages: [{ id: 'image', label: 'Image', nodeType: 'aiV3', purpose: 'Generate image', knowledgeIds: [] }],
    approvalsRequired: ['applyDraft'],
    knowledgeInfluences: [],
  };
  const service = new WorkflowArchitectService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    async chatCompletion() {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              { message: { content: JSON.stringify({ nodes: [{ id: 'onlyOne', type: 'unknownNode' }], edges: [] }) } },
            ],
          };
        },
      };
    },
  });

  const result = await service.tryCreateWorkflow(
    {
      input: intent.sourceText,
      context: {
        agent: {
          plannerModel: {
            id: 'planner-model',
            modelId: 'planner-model',
            configId: 'default',
            label: 'planner-model',
          },
        },
      },
    },
    intent,
    draft,
  );

  assert.equal(result.workflow, null);
  assert.equal(result.attempt.used, false);
  assert.equal(result.attempt.source, 'failed');
  assert.match(result.attempt.reason, /回退本地编排/);
});

test('workflow architect repairs an invalid DSL once before falling back', async () => {
  const { WorkflowArchitectService } = await import(
    `../src/modules/intelligence/workflow-builder/workflow-architect.service.ts?test=${Date.now()}`
  );
  const intent = {
    id: 'intent_architect_repair',
    sourceText: 'Create a product image workflow with a planning chat node and saved result',
    name: 'Repair architect test',
    goal: 'Create a product image workflow with a planning chat node and saved result',
    domain: 'ecommerce-image',
    inputs: [],
    outputCount: 1,
    requiresImageInput: false,
    requiresTextInput: true,
    requiresVideoInput: false,
    requiresAudioInput: false,
  };
  const draft = {
    id: 'draft_architect_repair',
    name: 'Repair architect test',
    description: 'Repair architect test draft',
    intentId: intent.id,
    stages: [{ id: 'image', label: 'Image', nodeType: 'aiV3', purpose: 'Generate image', knowledgeIds: [] }],
    approvalsRequired: ['applyDraft'],
    knowledgeInfluences: [],
  };
  const invalidDsl = {
    name: 'Invalid ports',
    nodes: [
      { id: 'brief', type: 'io', data: { content: 'brief' } },
      { id: 'image', type: 'aiV3', data: { mode: 'image', n: 1 } },
      { id: 'save', type: 'io', data: {} },
      { id: 'result', type: 'io', data: {} },
    ],
    edges: [
      { source: 'brief', sourceHandle: 'result', target: 'image', targetHandle: 'wrongPrompt' },
      { source: 'image', sourceHandle: 'result', target: 'save', targetHandle: 'input' },
      { source: 'save', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
    ],
    settings: { workflowExecution: { enabled: true, maxConcurrency: 2 } },
  };
  const repairedDsl = {
    ...invalidDsl,
    name: 'Repaired ports',
    edges: [
      { source: 'brief', sourceHandle: 'result', target: 'image', targetHandle: 'input' },
      { source: 'image', sourceHandle: 'result', target: 'save', targetHandle: 'input' },
      { source: 'save', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
    ],
  };
  let calls = 0;
  const service = new WorkflowArchitectService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    async chatCompletion(request) {
      calls += 1;
      if (calls === 2) {
        assert.match(request.messages.at(-1).content, /EDGE_TARGET_HANDLE_INVALID|REQUIRED_INPUT_MISSING/);
      }
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify(calls === 1 ? invalidDsl : repairedDsl) } }] };
        },
      };
    },
  });

  const result = await service.tryCreateWorkflow(
    {
      input: intent.sourceText,
      context: {
        agent: {
          plannerModel: {
            id: 'planner-model',
            modelId: 'planner-model',
            configId: 'default',
            label: 'planner-model',
          },
        },
      },
    },
    intent,
    draft,
  );

  assert.equal(calls, 2);
  assert.equal(result.attempt.used, true);
  assert.match(result.attempt.reason, /自动修复/);
  assert.equal(result.workflow.edges[0].targetHandle, 'input');
  assert.equal(result.workflow.metadata.source, 'intelligence.workflowArchitectDsl');
});

test('workflow architect rejects an oversimplified complex DSL and repairs it into multi-branch batch work', async () => {
  const { WorkflowArchitectService } = await import(
    `../src/modules/intelligence/workflow-builder/workflow-architect.service.ts?test=${Date.now()}`
  );
  const intent = {
    id: 'intent_architect_complex_quality',
    sourceText:
      'Create a multi-branch ecommerce asset pack with product image, brand brief, main visual, detail hero, copywriting, and 6 storyboard shots.',
    name: 'Complex architect quality test',
    goal: 'Create a multi-branch ecommerce asset pack with product image, brand brief, main visual, detail hero, copywriting, and 6 storyboard shots.',
    domain: 'ecommerce-image',
    inputs: [],
    outputCount: 6,
    requiresImageInput: true,
    requiresTextInput: true,
    requiresVideoInput: false,
    requiresAudioInput: false,
  };
  const draft = {
    id: 'draft_architect_complex_quality',
    name: 'Complex architect quality test',
    description: 'Complex architect quality test draft',
    intentId: intent.id,
    stages: [{ id: 'image', label: 'Image', nodeType: 'aiV3', purpose: 'Generate image', knowledgeIds: [] }],
    approvalsRequired: ['applyDraft'],
    knowledgeInfluences: [],
  };
  const simpleDsl = {
    name: 'Too simple asset pack',
    nodes: [
      { id: 'brief', type: 'io', data: { content: 'asset brief' } },
      { id: 'image', type: 'aiV3', data: { mode: 'image', ratio: '1:1', resolution: '1k', n: 1, output_format: 'png' } },
      { id: 'save', type: 'io', data: { filenamePrefix: 'asset' } },
      { id: 'result', type: 'io', data: {} },
    ],
    edges: [
      { source: 'brief', sourceHandle: 'result', target: 'image', targetHandle: 'input' },
      { source: 'image', sourceHandle: 'result', target: 'save', targetHandle: 'input' },
      { source: 'save', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
    ],
    settings: { workflowExecution: { enabled: false, maxConcurrency: 1 } },
  };
  const complexDsl = {
    name: 'Multi-branch asset pack',
    nodes: [
      { id: 'brief', type: 'io', data: { content: 'asset brief' } },
      { id: 'reference', type: 'io', data: {} },
      {
        id: 'designer',
        type: 'aiV3',
        data: { mode: 'chat',
          temperature: 0.45,
          maxTokens: 4096,
          systemPrompt:
            'Act as an ecommerce design strategist. Split the request into visual, copy, and storyboard production briefs. Output storyboard shots one per line with no explanation.',
        },
      },
      {
        id: 'copywriter',
        type: 'aiV3',
        data: { mode: 'chat',
          temperature: 0.7,
          maxTokens: 4096,
          systemPrompt:
            'Act as an ecommerce copywriter. Produce title, benefit bullets, hero copy, and caption options.',
        },
      },
      { id: 'mainImage', type: 'aiV3', data: { mode: 'image', ratio: '1:1', resolution: '1k', n: 4, output_format: 'png' } },
      { id: 'detailHero', type: 'aiV3', data: { mode: 'image', ratio: '16:9', resolution: '1k', n: 2, output_format: 'png' } },
      { id: 'shotSplit', type: 'textSplit', data: { separator: '\n', outputCount: 6 } },
      { id: 'shotIterate', type: 'iterateRun', data: {} },
      { id: 'shotImage', type: 'aiV3', data: { mode: 'image', ratio: '16:9', resolution: '1k', n: 1, output_format: 'png' } },
      { id: 'mainSave', type: 'io', data: { filenamePrefix: 'main-visual' } },
      { id: 'detailSave', type: 'io', data: { filenamePrefix: 'detail-hero' } },
      { id: 'copySave', type: 'io', data: { filenamePrefix: 'copywriting' } },
      { id: 'shotSave', type: 'io', data: { filenamePrefix: 'storyboard-shot' } },
      { id: 'result', type: 'io', data: {} },
    ],
    edges: [
      { source: 'brief', sourceHandle: 'result', target: 'designer', targetHandle: 'input' },
      { source: 'reference', sourceHandle: 'result', target: 'designer', targetHandle: 'input' },
      { source: 'designer', sourceHandle: 'result', target: 'mainImage', targetHandle: 'input' },
      { source: 'reference', sourceHandle: 'result', target: 'mainImage', targetHandle: 'input' },
      { source: 'designer', sourceHandle: 'result', target: 'detailHero', targetHandle: 'input' },
      { source: 'reference', sourceHandle: 'result', target: 'detailHero', targetHandle: 'input' },
      { source: 'designer', sourceHandle: 'result', target: 'copywriter', targetHandle: 'input' },
      { source: 'designer', sourceHandle: 'result', target: 'shotSplit', targetHandle: 'text' },
      { source: 'shotSplit', sourceHandle: 'part1', target: 'shotIterate', targetHandle: 'item1' },
      { source: 'shotSplit', sourceHandle: 'part2', target: 'shotIterate', targetHandle: 'item2' },
      { source: 'shotSplit', sourceHandle: 'part3', target: 'shotIterate', targetHandle: 'item3' },
      { source: 'shotSplit', sourceHandle: 'part4', target: 'shotIterate', targetHandle: 'item4' },
      { source: 'shotSplit', sourceHandle: 'part5', target: 'shotIterate', targetHandle: 'item5' },
      { source: 'shotSplit', sourceHandle: 'part6', target: 'shotIterate', targetHandle: 'item6' },
      { source: 'shotIterate', sourceHandle: 'text', target: 'shotImage', targetHandle: 'input' },
      { source: 'mainImage', sourceHandle: 'result', target: 'mainSave', targetHandle: 'input' },
      { source: 'detailHero', sourceHandle: 'result', target: 'detailSave', targetHandle: 'input' },
      { source: 'copywriter', sourceHandle: 'result', target: 'copySave', targetHandle: 'input' },
      { source: 'shotImage', sourceHandle: 'result', target: 'shotSave', targetHandle: 'input' },
      { source: 'mainSave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
      { source: 'detailSave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
      { source: 'copySave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
      { source: 'shotSave', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
    ],
    settings: { workflowExecution: { enabled: true, maxConcurrency: 4 } },
  };
  let calls = 0;
  const service = new WorkflowArchitectService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    async chatCompletion(request) {
      calls += 1;
      assert.match(request.messages[0].content, /多条并行链路/);
      assert.match(request.messages[0].content, /关键参数/);
      if (calls === 2) {
        assert.match(request.messages.at(-1).content, /ARCHITECT_COMPLEX|ARCHITECT_BATCH|多链路|逐项/);
      }
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify(calls === 1 ? simpleDsl : complexDsl) } }] };
        },
      };
    },
  });

  const result = await service.tryCreateWorkflow(
    {
      input: intent.sourceText,
      context: {
        agent: {
          plannerModel: {
            id: 'planner-model',
            modelId: 'planner-model',
            configId: 'default',
            label: 'planner-model',
          },
        },
      },
    },
    intent,
    draft,
  );

  const nodeTypes = result.workflow.nodes.map((node) => node.type);
  assert.equal(calls, 2);
  assert.equal(result.attempt.used, true);
  assert.equal(result.workflow.nodes.filter((node) => node.type === 'aiV3' && node.data?.mode === 'chat').length, 2);
  assert.equal(result.workflow.nodes.filter((node) => node.type === 'aiV3' && node.data?.mode === 'image').length, 3);
  assert.equal(nodeTypes.includes('textSplit'), true);
  assert.equal(nodeTypes.includes('iterateRun'), true);
  assert.equal(result.workflow.settings.workflowExecution.enabled, true);
  assert.equal(result.workflow.nodes.find((node) => node.id === 'shotIterate').data.inputCount, 6);
  assert.equal(result.workflow.nodes.find((node) => node.id === 'mainImage').data.n, 4);
});

test('workflow architect requires textSplit separator and matching upstream aiChat output format', async () => {
  const { WorkflowArchitectService } = await import(
    `../src/modules/intelligence/workflow-builder/workflow-architect.service.ts?test=${Date.now()}`
  );
  const intent = {
    id: 'intent_architect_split_separator',
    sourceText: 'Create a batch storyboard workflow with 5 shots, split the script and generate each image.',
    name: 'Split separator architect test',
    goal: 'Create a batch storyboard workflow with 5 shots, split the script and generate each image.',
    domain: 'storyboard-image',
    inputs: [],
    outputCount: 5,
    requiresImageInput: false,
    requiresTextInput: true,
    requiresVideoInput: false,
    requiresAudioInput: false,
  };
  const draft = {
    id: 'draft_architect_split_separator',
    name: 'Split separator architect test',
    description: 'Split separator architect test draft',
    intentId: intent.id,
    stages: [{ id: 'image', label: 'Image', nodeType: 'aiV3', purpose: 'Generate image', knowledgeIds: [] }],
    approvalsRequired: ['applyDraft'],
    knowledgeInfluences: [],
  };
  const missingSeparatorDsl = {
    name: 'Missing split separator',
    nodes: [
      { id: 'script', type: 'io', data: { content: 'script' } },
      {
        id: 'planner',
        type: 'aiV3',
        data: { mode: 'chat',
          systemPrompt: 'Act as a storyboard director. Split the script into 5 shots.',
        },
      },
      { id: 'split', type: 'textSplit', data: { outputCount: 5 } },
      { id: 'iterate', type: 'iterateRun', data: {} },
      { id: 'image', type: 'aiV3', data: { mode: 'image', ratio: '16:9', resolution: '1k', n: 1, output_format: 'png' } },
      { id: 'save', type: 'io', data: { filenamePrefix: 'shot' } },
      { id: 'result', type: 'io', data: {} },
    ],
    edges: [
      { source: 'script', sourceHandle: 'result', target: 'planner', targetHandle: 'input' },
      { source: 'planner', sourceHandle: 'result', target: 'split', targetHandle: 'text' },
      { source: 'split', sourceHandle: 'part1', target: 'iterate', targetHandle: 'item1' },
      { source: 'split', sourceHandle: 'part2', target: 'iterate', targetHandle: 'item2' },
      { source: 'split', sourceHandle: 'part3', target: 'iterate', targetHandle: 'item3' },
      { source: 'split', sourceHandle: 'part4', target: 'iterate', targetHandle: 'item4' },
      { source: 'split', sourceHandle: 'part5', target: 'iterate', targetHandle: 'item5' },
      { source: 'iterate', sourceHandle: 'text', target: 'image', targetHandle: 'input' },
      { source: 'image', sourceHandle: 'result', target: 'save', targetHandle: 'input' },
      { source: 'save', sourceHandle: 'result', target: 'result', targetHandle: 'input' },
    ],
    settings: { workflowExecution: { enabled: true, maxConcurrency: 4 } },
  };
  const repairedDsl = {
    ...missingSeparatorDsl,
    name: 'Repaired split separator',
    nodes: missingSeparatorDsl.nodes.map((node) => {
      if (node.id === 'planner') {
        return {
          ...node,
          data: {
            ...node.data,
            systemPrompt:
              'Act as a storyboard director. Split the script into 5 shots. Output exactly one shot per line, separated by newline, with no explanation.',
          },
        };
      }
      if (node.id === 'split') return { ...node, data: { separator: '\n', outputCount: 5 } };
      return node;
    }),
  };
  let calls = 0;
  const service = new WorkflowArchitectService({
    settings: {
      buildRuntimeConfig() {
        return {
          apiKey: 'test-key',
          baseUrl: 'https://example.test/v1',
          providerConfig: {},
          projectModels: [{ id: 'planner-model', modelId: 'planner-model', enabled: true }],
        };
      },
    },
    async chatCompletion(request) {
      calls += 1;
      assert.match(request.messages[0].content, /textSplit.*separator/s);
      if (calls === 2) {
        assert.match(
          request.messages.at(-1).content,
          /ARCHITECT_TEXT_SPLIT_SEPARATOR_MISSING|ARCHITECT_TEXT_SPLIT_UPSTREAM_PROMPT_MISSING_SEPARATOR/,
        );
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify(calls === 1 ? missingSeparatorDsl : repairedDsl) } }],
          };
        },
      };
    },
  });

  const result = await service.tryCreateWorkflow(
    {
      input: intent.sourceText,
      context: {
        agent: {
          plannerModel: {
            id: 'planner-model',
            modelId: 'planner-model',
            configId: 'default',
            label: 'planner-model',
          },
        },
      },
    },
    intent,
    draft,
  );

  assert.equal(calls, 2);
  assert.equal(result.attempt.used, true);
  assert.equal(result.workflow.nodes.find((node) => node.id === 'split').data.separator, '\n');
  assert.match(
    result.workflow.nodes.find((node) => node.id === 'planner').data.systemPrompt,
    /one shot per line|newline/,
  );
});

test('intelligence workflow draft can create a chat text workflow instead of image generation', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-chat');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个客服问答工作流，输入用户问题，输出结构化回复并保存文本。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.intent.domain, 'chat-text');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'image'),
      false,
    );
    assert.equal(response.body.data.validation.valid, true);
    assert.equal(response.body.data.workflow.metadata.intentDomain, 'chat-text');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft can create a video generation workflow', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-video');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个图生视频工作流，输入参考图和分镜描述，输出 5 秒短视频。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.intent.domain, 'video-generation');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'io', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'),
      false,
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'image'),
      false,
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'video'),
      true,
    );
    assert.equal(response.body.data.validation.valid, true);
    assert.equal(response.body.data.workflow.metadata.intentDomain, 'video-generation');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft only adds promptHelper for explicit visual control tasks', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-prompt-helper');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个产品三视图工作流，输入产品图和说明，生成纯白背景的正面、侧面、背面参考图。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'io', 'promptHelper', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.draft.stages.some((stage) => stage.nodeType === 'promptHelper'),
      true,
    );
    assert.equal(
      response.body.data.workflow.nodes.find((node) => node.id === 'prompt_helper').data.activeTool,
      'layout',
    );
    assert.equal(
      response.body.data.workflow.edges.some((edge) => edge.source === 'prompt_helper' && edge.target === 'image_gen'),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft treats storyboard images as image generation, not video generation', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-storyboard-image');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我生成 6 格分镜图，画面是一个咖啡广告从清晨到夜晚的故事板。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.intent.domain, 'storyboard-image');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'aiV3', 'textSplit', 'iterateRun', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'video'),
      false,
    );
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'shot_split').data.outputCount, 6);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'shot_image_gen').data.n, 1);
    assert.equal(response.body.data.workflow.settings.workflowExecution.enabled, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft treats storyboard scripts as text workflows', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-storyboard-script');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我生成一份 8 镜头的短视频分镜脚本，包含镜头描述、景别和旁白。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.intent.domain, 'chat-text');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'aiV3', 'io', 'io'],
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'video'),
      false,
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'image'),
      false,
    );
    assert.equal(
      response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft builds a multi-branch ecommerce asset pack workflow', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-complex-asset-pack');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input:
          '帮我做一个复杂电商素材包工作流，输入产品图、卖点和品牌规范，同时生成主图、详情页首屏、标题文案和 6 个短视频分镜图，多条链路并行输出。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.validation.valid, true);
    const nodeTypes = response.body.data.workflow.nodes.map((node) => node.type);
    assert.equal(response.body.data.workflow.nodes.filter((node) => node.type === 'aiV3' && node.data?.mode === 'chat').length >= 2, true);
    assert.equal(response.body.data.workflow.nodes.filter((node) => node.type === 'aiV3' && node.data?.mode === 'image').length >= 3, true);
    assert.equal(nodeTypes.includes('textSplit'), true);
    assert.equal(nodeTypes.includes('iterateRun'), true);
    assert.equal(response.body.data.workflow.settings.workflowExecution.enabled, true);
    assert.equal(response.body.data.workflow.settings.workflowExecution.maxConcurrency, 4);
    assert.equal(
      response.body.data.workflow.edges.some(
        (edge) => edge.source === 'storyboard_iterate' && edge.target === 'storyboard_image_gen',
      ),
      true,
    );
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'main_image_gen').data.n, 4);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'detail_image_gen').data.ratio, '16:9');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow draft builds a batch storyboard workflow with iterateRun', async () => {
  const { server, baseUrl } = await createTestServer('workflow-draft-batch-storyboard');
  try {
    const response = await requestJson(baseUrl, '/api/intelligence/workflow-drafts', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我做一个 8 镜头分镜图批量生成工作流，先把文本脚本拆成每个镜头，再逐项运行生成每个镜头图片。',
      }),
    });

    assert.equal(response.status, 200);
    assertEnvelopeShape(response.body);
    assert.equal(response.body.data.validation.valid, true);
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['io', 'aiV3', 'textSplit', 'iterateRun', 'aiV3', 'io', 'io'],
    );
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'shot_split').data.outputCount, 8);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'shot_image_gen').data.n, 1);
    assert.equal(
      response.body.data.workflow.edges.filter((edge) => edge.source === 'shot_split' && edge.target === 'shot_iterate')
        .length,
      8,
    );
    assert.equal(response.body.data.workflow.settings.workflowExecution.enabled, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence knowledge can write local user memory and search with source metadata', async () => {
  const { server, baseUrl } = await createTestServer('knowledge-write-search');
  try {
    const written = await requestJson(baseUrl, '/api/intelligence/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        category: 'user-memory',
        title: '结果展示偏好',
        content: '用户喜欢在结果面板里直接预览图片和文本，不喜欢打开新页面。',
        tags: ['preference', 'workflow-results'],
        source: { kind: 'user_input', label: 'manual test' },
        evidence: [{ kind: 'conversation', id: 'test-conversation' }],
        confidence: 0.76,
      }),
    });
    assert.equal(written.status, 200);
    assertEnvelopeShape(written.body);
    assert.equal(written.body.data.status, 'written');
    assert.equal(written.body.data.record.category, 'user-memory');
    assert.equal(written.body.data.record.scope, 'local-private');
    assert.equal(written.body.data.record.source.kind, 'user_input');
    assert.equal(written.body.data.record.evidence[0].kind, 'conversation');
    assert.equal(written.body.data.record.sourceRuntime, 'local');
    assert.equal(written.body.data.record.syncStatus, 'localOnly');

    const searched = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({
        query: '结果面板 预览',
        categories: ['user-memory'],
      }),
    });
    assert.equal(searched.status, 200);
    assertEnvelopeShape(searched.body);
    assert.equal(searched.body.data.source, 'local-json');
    assert.equal(searched.body.data.items.length, 1);
    assert.equal(searched.body.data.items[0].type, 'user_memory');
    assert.equal(searched.body.data.items[0].source.kind, 'user_input');
    assert.equal(searched.body.data.items[0].governance.role, 'context_only');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence knowledge rebuilds traceable seed records from system and saved project data', async () => {
  const { server, baseUrl } = await createTestServer('knowledge-seeds');
  try {
    const written = await requestJson(baseUrl, '/api/intelligence/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        category: 'user-memory',
        title: '保留的用户偏好',
        content: '用户希望知识库重建时不要删除手写记忆。',
        source: { kind: 'user_input' },
      }),
    });
    assert.equal(written.status, 200);

    const workflow = {
      id: 'wf_seed_index',
      name: '种子索引测试工作流',
      description: '用于验证已保存工作流可以成为知识来源。',
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'chat',
          type: 'aiV3',
          position: { x: 240, y: 0 },
          data: {},
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 480, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_chat',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'chat',
          targetHandle: 'input',
        },
        {
          id: 'edge_chat_output',
          source: 'chat',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };
    const saved = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
    assert.equal(saved.status, 200);

    const rebuilt = await requestJson(baseUrl, '/api/intelligence/knowledge/rebuild-seeds', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(rebuilt.status, 200);
    assertEnvelopeShape(rebuilt.body);
    assert.equal(rebuilt.body.data.status, 'rebuilt');
    assert.equal(rebuilt.body.data.categories['workflow-knowledge'].added >= 9, true);

    const searchNode = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'aiV3 chat image video', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchNode.status, 200);
    assert.equal(
      searchNode.body.data.items.some(
        (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'aiV3',
      ),
      true,
    );

    const searchPromptHelper = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'promptHelper 普通 图像 生成', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchPromptHelper.status, 200);
    const promptHelperSeed = searchPromptHelper.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'promptHelper',
    );
    assert.equal(Boolean(promptHelperSeed), true);
    assert.match(promptHelperSeed.content, /不是通用提示词优化器/);
    assert.equal(promptHelperSeed.structured.category, 'tool');
    assert.equal(promptHelperSeed.structured.maturity, 'limited');
    assert.equal(promptHelperSeed.structured.avoidWhen.includes('simple-image-generation'), true);
    assert.equal(promptHelperSeed.structured.avoidWhen.includes('storyboard-script'), true);

    const searchAiV3 = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'aiV3 video image generation', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchAiV3.status, 200);
    const aiV3Seed = searchAiV3.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'aiV3',
    );
    assert.equal(Boolean(aiV3Seed), true);

    const searchTextSplit = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'textSplit 拆分脚本 多段提示词', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchTextSplit.status, 200);
    const textSplitSeed = searchTextSplit.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'textSplit',
    );
    assert.equal(Boolean(textSplitSeed), true);
    assert.equal(
      textSplitSeed.structured.inputs.some((input) => input.id === 'text' && input.type === 'string'),
      true,
    );
    assert.equal(textSplitSeed.structured.useWhen.includes('split-script'), true);

    const searchIterateRun = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'iterateRun 逐项 并行 下游', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchIterateRun.status, 200);
    const iterateRunSeed = searchIterateRun.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'iterateRun',
    );
    assert.equal(Boolean(iterateRunSeed), true);
    assert.match(iterateRunSeed.content, /为每个非空文本创建一次下游段执行/);
    assert.equal(iterateRunSeed.structured.maturity, 'stable');
    assert.equal(iterateRunSeed.structured.useWhen.includes('batch-text-processing'), true);
    assert.equal(
      iterateRunSeed.structured.notes.some((note) => note.includes('workflow executor')),
      true,
    );

    const searchIterateImageRun = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'iterateImageRun 图片数组 逐项', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchIterateImageRun.status, 200);
    const iterateImageRunSeed = searchIterateImageRun.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'iterateImageRun',
    );
    assert.equal(Boolean(iterateImageRunSeed), true);
    assert.match(iterateImageRunSeed.content, /展开图片数组/);
    assert.equal(iterateImageRunSeed.structured.maturity, 'stable');
    assert.equal(iterateImageRunSeed.structured.useWhen.includes('batch-image-processing'), true);

    const searchImageCompare = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'imageCompare compare images', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchImageCompare.status, 200);
    const imageCompareSeed = searchImageCompare.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'imageCompare',
    );
    assert.equal(Boolean(imageCompareSeed), true);

    const searchWorkflow = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: '种子索引测试工作流', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchWorkflow.status, 200);
    assert.equal(
      searchWorkflow.body.data.items.some(
        (item) => item.source.kind === 'saved_workflow_index' && item.evidence[0]?.id === workflow.id,
      ),
      true,
    );

    const searchUserMemory = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: '不要删除手写记忆', categories: ['user-memory'] }),
    });
    assert.equal(searchUserMemory.status, 200);
    assert.equal(searchUserMemory.body.data.items.length, 1);
    assert.equal(searchUserMemory.body.data.items[0].source.kind, 'user_input');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('brand and project knowledge require confirmation before writing', async () => {
  const { server, baseUrl } = await createTestServer('knowledge-confirmation');
  try {
    const pending = await requestJson(baseUrl, '/api/intelligence/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        category: 'brand-knowledge',
        title: '品牌色规则',
        content: '品牌默认使用高饱和红色。',
      }),
    });
    assert.equal(pending.status, 200);
    assertEnvelopeShape(pending.body);
    assert.equal(pending.body.data.status, 'approval_required');
    assert.equal(pending.body.data.approvalCode, 'confirmKnowledgeWrite');

    const confirmed = await requestJson(baseUrl, '/api/intelligence/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        category: 'project-knowledge',
        title: '项目交付约束',
        content: '本项目输出必须包含可下载的最终结果文件。',
        confirmed: true,
        source: { kind: 'user_confirmed' },
      }),
    });
    assert.equal(confirmed.status, 200);
    assertEnvelopeShape(confirmed.body);
    assert.equal(confirmed.body.data.status, 'written');
    assert.equal(confirmed.body.data.record.scope, 'local-project');
    assert.equal(confirmed.body.data.record.requiresConfirmation, true);
    assert.equal(typeof confirmed.body.data.record.confirmedAt, 'number');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('run knowledge writes only when backed by a real execution trace', async () => {
  const { server, baseUrl } = await createTestServer('knowledge-run-trace');
  try {
    const missingTrace = await requestJson(baseUrl, '/api/intelligence/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        category: 'run-knowledge',
        title: '无 trace 运行经验',
        content: '这条记录不应该被写入。',
      }),
    });
    assert.equal(missingTrace.status, 400);
    assertEnvelopeShape(missingTrace.body);
    assert.equal(missingTrace.body.error.code, 'KNOWLEDGE_RUN_TRACE_REQUIRED');

    const workflow = {
      id: 'wf_intelligence_knowledge_run',
      name: '知识库运行经验测试',
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };
    const saved = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
    assert.equal(saved.status, 200);

    const executed = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '执行并沉淀运行经验',
        skills: ['workflow.execute'],
        context: {
          workflowId: workflow.id,
          confirmed: true,
        },
      }),
    });
    assert.equal(executed.status, 200);
    const runId = executed.body.data.skillResults[0].output.run.runId;

    const summarized = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '把运行经验写入知识库',
        skills: ['knowledge.summarizeRun'],
        context: { runId },
      }),
    });
    assert.equal(summarized.status, 200);
    assertEnvelopeShape(summarized.body);
    assert.equal(summarized.body.data.skillResults[0].output.status, 'written');
    assert.equal(summarized.body.data.skillResults[0].output.record.category, 'run-knowledge');
    assert.equal(summarized.body.data.skillResults[0].output.record.evidence[0].kind, 'run_trace');

    const searched = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: runId, categories: ['run-knowledge'] }),
    });
    assert.equal(searched.status, 200);
    assert.equal(searched.body.data.items.length, 1);
    assert.equal(searched.body.data.items[0].evidence[0].id, runId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow execution skill requires confirmation before running', async () => {
  const { server, baseUrl } = await createTestServer('workflow-execute-confirmation');
  try {
    const workflow = {
      id: 'wf_intelligence_execute',
      name: '智能执行测试工作流',
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };

    const saved = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
    assert.equal(saved.status, 200);

    const pending = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '执行这个工作流',
        skills: ['workflow.suggestInputs', 'workflow.execute'],
        context: {
          workflowId: workflow.id,
        },
      }),
    });
    assert.equal(pending.status, 200);
    assertEnvelopeShape(pending.body);
    assert.equal(pending.body.data.skillResults[1].output.approvalRequired, true);
    assert.equal(pending.body.data.skillResults[1].output.approvalCode, 'executeWorkflow');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('confirmed intelligence workflow execution returns run summary and can be diagnosed', async () => {
  const { server, baseUrl } = await createTestServer('workflow-execute-confirmed');
  try {
    const workflow = {
      id: 'wf_intelligence_confirmed',
      name: '智能确认执行工作流',
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };

    const saved = await requestJson(baseUrl, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
    assert.equal(saved.status, 200);

    const executed = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '确认执行这个工作流',
        skills: ['workflow.execute'],
        context: {
          workflowId: workflow.id,
          confirmed: true,
          inputs: {
            prompt: '来自 intelligence 的输入覆盖',
          },
        },
      }),
    });
    assert.equal(executed.status, 200);
    assertEnvelopeShape(executed.body);
    const run = executed.body.data.skillResults[0].output.run;
    assert.equal(run.status, 'completed');
    assert.equal(run.workflowId, workflow.id);
    assert.equal(run.appliedInputs[0].nodeId, 'prompt');
    assert.match(run.summary, /runId:/);

    const diagnosis = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '诊断并总结刚才的运行',
        skills: ['workflow.diagnose', 'workflow.summarizeRun'],
        context: {
          runId: run.runId,
        },
      }),
    });
    assert.equal(diagnosis.status, 200);
    assert.equal(diagnosis.body.data.skillResults[0].output.status.status, 'completed');
    assert.equal(diagnosis.body.data.skillResults[0].output.diagnosis.severity, 'info');
    assert.match(diagnosis.body.data.skillResults[1].output.summary, /completed/);
    assert.ok(Array.isArray(diagnosis.body.data.skillResults[1].output.report.keyOutputs));
    assert.equal(diagnosis.body.data.skillResults[1].output.report.keyOutputs.length > 0, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow inspect and edit skills summarize the current canvas and generate a patch preview', async () => {
  const { server, baseUrl } = await createTestServer('workflow-edit-preview');
  try {
    const workflow = {
      id: 'wf_edit_preview_http',
      name: '当前画布工作流',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认提示词' },
        },
        {
          id: 'image_gen',
          type: 'aiV3',
          position: { x: 220, y: 0 },
          data: { mode: 'image', n: 2, ratio: '1:1', output_format: 'jpeg' },
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 440, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_image',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'image_gen',
          targetHandle: 'input',
        },
        {
          id: 'edge_image_output',
          source: 'image_gen',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };

    const inspected = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '检查一下当前工作流',
        skills: ['workflow.inspect'],
        context: {
          workflowSnapshot: workflow,
        },
      }),
    });
    assert.equal(inspected.status, 200);
    assertEnvelopeShape(inspected.body);
    assert.equal(inspected.body.data.skillResults[0].output.workflow.nodeCount, 3);
    assert.equal(inspected.body.data.skillResults[0].output.workflow.inputNodes[0].nodeId, 'prompt');

    const edited = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '把这个工作流改成生成 6 张横版 PNG 图',
        skills: ['workflow.edit'],
        context: {
          workflowSnapshot: workflow,
        },
      }),
    });
    assert.equal(edited.status, 200);
    assertEnvelopeShape(edited.body);
    const patch = edited.body.data.skillResults[0].output.patch;
    assert.equal(Array.isArray(patch.operations), true);
    assert.equal(
      patch.operations.some((operation) => operation.field === 'n' && operation.to === 6),
      true,
    );
    assert.equal(
      patch.operations.some((operation) => operation.field === 'ratio' && operation.to === '16:9'),
      true,
    );
    assert.equal(
      patch.operations.some((operation) => operation.field === 'output_format' && operation.to === 'png'),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence workflow applyDraft skill previews confirmation and applies validated patch after confirmation', async () => {
  const { server, baseUrl } = await createTestServer('workflow-apply-draft');
  try {
    const workflow = {
      id: 'wf_apply_preview_http',
      name: '当前画布工作流',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        {
          id: 'prompt',
          type: 'io',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认提示词' },
        },
        {
          id: 'image_gen',
          type: 'aiV3',
          position: { x: 220, y: 0 },
          data: { mode: 'image', n: 2, ratio: '1:1', output_format: 'jpeg' },
        },
        {
          id: 'output',
          type: 'io',
          position: { x: 440, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_image',
          source: 'prompt',
          sourceHandle: 'result',
          target: 'image_gen',
          targetHandle: 'input',
        },
        {
          id: 'edge_image_output',
          source: 'image_gen',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
        },
      ],
      settings: {},
    };

    const edited = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '把这个工作流改成生成 6 张横版 PNG 图',
        skills: ['workflow.edit'],
        context: {
          workflowSnapshot: workflow,
        },
      }),
    });
    assert.equal(edited.status, 200);
    const patch = edited.body.data.skillResults[0].output.patch;

    const preview = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '应用这些修改',
        skills: ['workflow.applyDraft'],
        context: {
          workflowSnapshot: workflow,
          workflowEditPatch: patch,
        },
      }),
    });
    assert.equal(preview.status, 200);
    assertEnvelopeShape(preview.body);
    assert.equal(preview.body.data.skillResults[0].output.approvalRequired, true);
    assert.equal(preview.body.data.skillResults[0].output.approvalCode, 'applyWorkflowDraft');

    const applied = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '确认应用这些修改',
        skills: ['workflow.applyDraft'],
        context: {
          workflowSnapshot: workflow,
          workflowEditPatch: patch,
          confirmed: true,
        },
      }),
    });
    assert.equal(applied.status, 200);
    assertEnvelopeShape(applied.body);
    assert.equal(applied.body.data.skillResults[0].output.applied, true);
    const imageGen = applied.body.data.skillResults[0].output.workflow.nodes.find((node) => node.id === 'image_gen');
    assert.equal(imageGen.data.n, 6);
    assert.equal(imageGen.data.ratio, '16:9');
    assert.equal(imageGen.data.output_format, 'png');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence run can include workflow.createDraft skill in trace', async () => {
  const { server, baseUrl } = await createTestServer('run-workflow-draft');
  try {
    const created = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '生成 3 张小红书首发图工作流',
        skills: ['workflow.createDraft'],
      }),
    });

    assert.equal(created.status, 200);
    assertEnvelopeShape(created.body);
    assert.deepEqual(created.body.data.requestedSkills, ['workflow.createDraft']);
    assert.equal(created.body.data.skillResults[0].skillId, 'workflow.createDraft');
    assert.equal(
      created.body.data.skillResults[0].output.workflow.nodes.some((node) => node.type === 'aiV3' && node.data?.mode === 'image'),
      true,
    );
    assert.equal(created.body.data.skillResults[0].output.approvalsRequired.includes('applyDraft'), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence local team run creates role outputs, review, and workflow draft without applying it', async () => {
  const { server, baseUrl } = await createTestServer('team-run');
  try {
    const created = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '帮我设计一个电商新品发布素材工作流，包含主图、详情页首屏和短视频方向。',
        skills: ['team.list', 'team.run'],
        context: {
          teamId: 'ecommerce-assets',
        },
      }),
    });

    assert.equal(created.status, 200);
    assertEnvelopeShape(created.body);
    assert.deepEqual(created.body.data.requestedSkills, ['team.list', 'team.run']);
    assert.equal(
      created.body.data.skillResults[0].output.teams.some((team) => team.id === 'ecommerce-assets'),
      true,
    );

    const teamOutput = created.body.data.skillResults[1].output;
    assert.equal(teamOutput.team.id, 'ecommerce-assets');
    assert.equal(
      teamOutput.plan.tasks.some((task) => task.roleHint === 'workflow-architect'),
      true,
    );
    assert.equal(
      teamOutput.roleOutputs.some((output) => output.roleId === 'workflow-architect'),
      true,
    );
    assert.equal(Array.isArray(teamOutput.workflowDraft.workflow.nodes), true);
    assert.equal(teamOutput.workflowDraft.validation.valid, true);
    assert.equal(teamOutput.workflowDraft.approvalsRequired.includes('applyDraft'), true);
    assert.equal(teamOutput.review.verdict, 'needs-confirmation');
    assert.equal(teamOutput.approvalsRequired.includes('applyDraft'), true);
    assert.equal(teamOutput.approvalsRequired.includes('executeWorkflow'), true);
    assert.equal(
      teamOutput.trace.every((item) => item.source === 'local-rule'),
      true,
    );

    const workflows = await requestJson(baseUrl, '/api/workflows');
    assert.equal(workflows.status, 200);
    assert.equal(
      workflows.body.data.some((workflow) => workflow.id === teamOutput.workflowDraft.workflow.id),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence run creates and reads a trace without affecting legacy agent route', async () => {
  const { server, baseUrl } = await createTestServer('run');
  try {
    const agentStatus = await requestJson(baseUrl, '/api/agent/status');
    assert.equal(agentStatus.status, 200);
    assertEnvelopeShape(agentStatus.body);

    const created = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '盘点当前可用工作流和模型',
        skills: ['knowledge.search', 'workflow.list', 'model.list'],
      }),
    });
    assert.equal(created.status, 200);
    assertEnvelopeShape(created.body);
    assert.match(created.body.data.id, /^irun_/);
    assert.equal(created.body.data.status, 'completed');
    assert.deepEqual(created.body.data.requestedSkills, ['knowledge.search', 'workflow.list', 'model.list']);
    assert.equal(created.body.data.skillResults.length, 3);
    assert.equal(created.body.data.sourceRuntime, 'local');

    const fetched = await requestJson(baseUrl, `/api/intelligence/runs/${created.body.data.id}`);
    assert.equal(fetched.status, 200);
    assertEnvelopeShape(fetched.body);
    assert.equal(fetched.body.data.id, created.body.data.id);
    assert.equal(fetched.body.data.input, '盘点当前可用工作流和模型');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence run validates input and unknown skills on safe envelopes', async () => {
  const { server, baseUrl } = await createTestServer('validation');
  try {
    const invalid = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({ input: '   ' }),
    });
    assert.equal(invalid.status, 400);
    assertEnvelopeShape(invalid.body);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

    const unknownSkill = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '测试未知 skill',
        skills: ['workflow.destroy'],
      }),
    });
    assert.equal(unknownSkill.status, 400);
    assertEnvelopeShape(unknownSkill.body);
    assert.equal(unknownSkill.body.error.code, 'INTELLIGENCE_SKILL_UNKNOWN');

    const missing = await requestJson(baseUrl, '/api/intelligence/runs/does_not_exist');
    assert.equal(missing.status, 404);
    assertEnvelopeShape(missing.body);
    assert.equal(missing.body.error.code, 'INTELLIGENCE_RUN_NOT_FOUND');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
