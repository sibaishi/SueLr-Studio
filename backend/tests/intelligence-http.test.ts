// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
        'model.list',
        'brief.parse',
        'workflow.plan',
        'workflow.createDraft',
        'workflow.validate',
        'workflow.suggestInputs',
        'workflow.execute',
        'workflow.diagnose',
        'workflow.summarizeRun',
      ],
    );
    assert.equal(skills.body.data.find((skill) => skill.id === 'workflow.createDraft')?.sideEffect, 'writeDraft');
    assert.equal(skills.body.data.find((skill) => skill.id === 'team.run')?.sideEffect, 'writeDraft');
    assert.equal(skills.body.data.find((skill) => skill.id === 'workflow.execute')?.requiresApproval, true);
    assert.equal(skills.body.data.find((skill) => skill.id === 'knowledge.write')?.requiresApproval, true);
    assert.equal(
      skills.body.data
        .filter((skill) => !['workflow.execute', 'knowledge.write', 'knowledge.promoteToTemplate'].includes(skill.id))
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
    assert.equal(knowledge.body.data.files.every((file) => file.count === 0), true);
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
    assert.equal(response.body.data.draft.stages.some((stage) => stage.nodeType === 'imageGen'), true);
    assert.equal(response.body.data.workflow.name, '电商图片生成工作流草稿');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['imageInput', 'textInput', 'imageGen', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'), false);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'image_gen').data.n, 6);
    assert.equal(response.body.data.workflow.metadata.intentDomain, 'ecommerce-image');
    assert.equal(response.body.data.validation.valid, true);
    assert.equal(
      response.body.data.validation.issues.some((issue) => issue.code === 'MODEL_MISSING' && issue.severity === 'warning'),
      true,
    );
    assert.equal(response.body.data.approvalsRequired.includes('executeWorkflow'), true);

    const workflows = await requestJson(baseUrl, '/api/workflows');
    assert.equal(workflows.status, 200);
    assert.equal(workflows.body.data.some((workflow) => workflow.id === response.body.data.workflow.id), false);
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
  const { AgentPlannerService } = await import(`../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`);
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
    async chatCompletion() {
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
});

test('agent planner falls back to local tool plan when LLM output is unusable', async () => {
  const { AgentPlannerService } = await import(`../src/modules/intelligence/planner/agent-planner.service.ts?test=${Date.now()}`);
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
      ['textInput', 'aiChat', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'imageGen'), false);
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
      ['imageInput', 'textInput', 'videoGen', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'), false);
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'imageGen'), false);
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'videoGen'), true);
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
      ['imageInput', 'textInput', 'promptHelper', 'imageGen', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.draft.stages.some((stage) => stage.nodeType === 'promptHelper'), true);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'prompt_helper').data.activeTool, 'layout');
    assert.equal(
      response.body.data.workflow.edges.some(
        (edge) => edge.source === 'prompt_helper' && edge.target === 'image_gen',
      ),
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
    assert.equal(response.body.data.intent.domain, 'generic-image');
    assert.deepEqual(
      response.body.data.workflow.nodes.map((node) => node.type),
      ['textInput', 'promptHelper', 'imageGen', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'videoGen'), false);
    const helper = response.body.data.workflow.nodes.find((node) => node.id === 'prompt_helper');
    assert.equal(helper.data.activeTool, 'storyboard');
    assert.equal(helper.data.storyboardConfig.shotCount, 6);
    assert.equal(response.body.data.workflow.nodes.find((node) => node.id === 'image_gen').data.n, 1);
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
      ['textInput', 'aiChat', 'saveFile', 'output'],
    );
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'videoGen'), false);
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'imageGen'), false);
    assert.equal(response.body.data.workflow.nodes.some((node) => node.type === 'promptHelper'), false);
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
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'chat',
          type: 'aiChat',
          position: { x: 240, y: 0 },
          data: {},
        },
        {
          id: 'output',
          type: 'output',
          position: { x: 480, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_chat',
          source: 'prompt',
          sourceHandle: 'text',
          target: 'chat',
          targetHandle: 'prompt',
        },
        {
          id: 'edge_chat_output',
          source: 'chat',
          sourceHandle: 'response',
          target: 'output',
          targetHandle: 'content',
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
    assert.equal(rebuilt.body.data.categories['workflow-knowledge'].added >= 23, true);

    const searchNode = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'aiChat 对话', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchNode.status, 200);
    assert.equal(
      searchNode.body.data.items.some((item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'aiChat'),
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

    const searchVideoGen = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'videoGen 分镜图 分镜脚本', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchVideoGen.status, 200);
    const videoGenSeed = searchVideoGen.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'videoGen',
    );
    assert.equal(Boolean(videoGenSeed), true);
    assert.match(videoGenSeed.content, /生成分镜图、故事板图片、分镜脚本或镜头文案不应该使用 videoGen/);
    assert.equal(videoGenSeed.structured.avoidWhen.includes('storyboard-sheet'), true);

    const searchTextSplit = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'textSplit 拆分脚本 多段提示词', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchTextSplit.status, 200);
    const textSplitSeed = searchTextSplit.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'textSplit',
    );
    assert.equal(Boolean(textSplitSeed), true);
    assert.equal(textSplitSeed.structured.inputs.some((input) => input.id === 'text' && input.type === 'string'), true);
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

    const searchImageMerge = await requestJson(baseUrl, '/api/intelligence/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'imageMerge 多张参考图 拼图', categories: ['workflow-knowledge'], limit: 10 }),
    });
    assert.equal(searchImageMerge.status, 200);
    const imageMergeSeed = searchImageMerge.body.data.items.find(
      (item) => item.source.kind === 'system_seed' && item.structured.nodeType === 'imageMerge',
    );
    assert.equal(Boolean(imageMergeSeed), true);
    assert.match(imageMergeSeed.content, /多张图片引用/);
    assert.equal(imageMergeSeed.structured.useWhen.includes('multi-reference-image-input'), true);
    assert.equal(imageMergeSeed.structured.avoidWhen.includes('stitch-images-into-one'), true);

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
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'output',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'text',
          target: 'output',
          targetHandle: 'content',
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
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'output',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'text',
          target: 'output',
          targetHandle: 'content',
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
    assert.equal(pending.body.data.skillResults[0].output.requiredInputs[0].nodeId, 'prompt');
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
          type: 'textInput',
          position: { x: 0, y: 0 },
          data: { label: '提示词', text: '默认输入' },
        },
        {
          id: 'output',
          type: 'output',
          position: { x: 220, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_prompt_output',
          source: 'prompt',
          sourceHandle: 'text',
          target: 'output',
          targetHandle: 'content',
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
    assert.ok(Array.isArray(diagnosis.body.data.skillResults[1].output.report.artifacts));
    assert.equal(diagnosis.body.data.skillResults[1].output.report.keyOutputs.length > 0, true);
    assert.equal(diagnosis.body.data.skillResults[1].output.report.artifacts.length > 0, true);
    assert.match(diagnosis.body.data.skillResults[1].output.report.artifacts[0].url, /^\/api\/outputs\//);
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
    assert.equal(created.body.data.skillResults[0].output.workflow.nodes.some((node) => node.type === 'imageGen'), true);
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
    assert.equal(created.body.data.skillResults[0].output.teams.some((team) => team.id === 'ecommerce-assets'), true);

    const teamOutput = created.body.data.skillResults[1].output;
    assert.equal(teamOutput.team.id, 'ecommerce-assets');
    assert.equal(teamOutput.plan.tasks.some((task) => task.roleHint === 'workflow-architect'), true);
    assert.equal(teamOutput.roleOutputs.some((output) => output.roleId === 'workflow-architect'), true);
    assert.equal(Array.isArray(teamOutput.workflowDraft.workflow.nodes), true);
    assert.equal(teamOutput.workflowDraft.validation.valid, true);
    assert.equal(teamOutput.workflowDraft.approvalsRequired.includes('applyDraft'), true);
    assert.equal(teamOutput.review.verdict, 'needs-confirmation');
    assert.equal(teamOutput.approvalsRequired.includes('applyDraft'), true);
    assert.equal(teamOutput.approvalsRequired.includes('executeWorkflow'), true);
    assert.equal(teamOutput.trace.every((item) => item.source === 'local-rule'), true);

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
