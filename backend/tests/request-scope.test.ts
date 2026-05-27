// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `scope-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name, env = {}) {
  const root = createStorageDir(name);
  const previousEnv = {};
  for (const [key, value] of Object.entries({
    APP_CONFIG_DIR: root,
    APP_STORAGE_BOOTSTRAP_FILE: path.join(root, 'config', 'bootstrap.json'),
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: '1',
    ...env,
  })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const { createApp } = await import(`../src/app/create-app.ts?scope=${Date.now()}-${Math.random()}`);
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        restoreEnv() {
          for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        },
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

async function requestText(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    text: await response.text(),
  };
}

test('request scope defaults preserve single-user runtime behavior', async () => {
  const { createRequestScope, summarizeScopeFoundation } = await import('../src/platform/runtime/request-scope.ts');

  assert.deepEqual(createRequestScope({ runtimeMode: 'server-single-user' }), {
    userId: 'single-user',
    workspaceId: 'default',
    runtimeMode: 'server-single-user',
  });
  assert.deepEqual(summarizeScopeFoundation(createRequestScope({ runtimeMode: 'server-single-user' })), {
    enabled: true,
    userId: 'single-user',
    workspaceId: 'default',
    runtimeMode: 'server-single-user',
    source: 'single-user-default',
  });
});

test('HTTP status exposes active scope foundation diagnostics', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('status', {
    APP_RUNTIME_MODE: 'server-single-user',
  });
  try {
    const status = await requestJson(baseUrl, '/api/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.success, true);
    assert.deepEqual(status.body.data.scope, {
      enabled: true,
      userId: 'single-user',
      workspaceId: 'default',
      runtimeMode: 'server-single-user',
      source: 'single-user-default',
    });
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP request scope can be carried by standardized internal headers', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('headers', {
    APP_RUNTIME_MODE: 'server-single-user',
  });
  try {
    const status = await requestJson(baseUrl, '/api/status', {
      headers: {
        'x-suelr-user-id': 'user_123',
        'x-suelr-workspace-id': 'workspace_abc',
        'x-suelr-runtime-mode': 'server-multi-user',
      },
    });
    assert.equal(status.status, 200);
    assert.deepEqual(status.body.data.scope, {
      enabled: true,
      userId: 'user_123',
      workspaceId: 'workspace_abc',
      runtimeMode: 'server-multi-user',
      source: 'request',
    });
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('request logger entries carry request scope metadata', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('logs', {
    APP_RUNTIME_MODE: 'server-single-user',
  });
  const originalLog = console.log;
  const entries = [];
  console.log = (line) => {
    try {
      entries.push(JSON.parse(line));
    } catch {
      entries.push(line);
    }
  };

  try {
    const health = await requestJson(baseUrl, '/api/health', {
      headers: { 'x-request-id': 'scope-test-request' },
    });
    assert.equal(health.status, 200);

    const started = entries.find((entry) => entry?.message === 'request started' && entry.requestId === 'scope-test-request');
    assert.equal(started?.scope?.userId, 'single-user');
    assert.equal(started?.scope?.workspaceId, 'default');
    assert.equal(started?.scope?.runtimeMode, 'server-single-user');
  } finally {
    console.log = originalLog;
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('key service interfaces accept scope-aware options without changing single-user results', async () => {
  const scope = { userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' };
  const { WorkflowsService } = await import('../src/modules/workflows/workflows.service.ts');
  const { FilesService } = await import('../src/modules/files/files.service.ts');
  const { ExecutionService } = await import('../src/modules/execution/execution.service.ts');

  const workflows = new WorkflowsService({
    list: () => [{
      id: 'wf_1',
      name: 'Scoped workflow',
      description: '',
      nodes: [],
      updatedAt: 123,
    }],
    read: (id) => ({ workflow: { id, name: 'Scoped workflow', nodes: [], edges: [] } }),
    save: () => {},
    delete: () => {},
  });
  assert.equal(workflows.list({ scope })[0].id, 'wf_1');
  assert.equal(workflows.getById('wf_1', { scope }).name, 'Scoped workflow');

  const files = new FilesService({
    listGeneratedOutputs: async () => [{ name: 'out.txt' }],
    clearGeneratedOutputs: () => ({ removed: 1 }),
  });
  assert.deepEqual(await files.listGeneratedOutputs({ scope }), [{ name: 'out.txt' }]);
  assert.deepEqual(files.clearGeneratedOutputs({ scope }), { removed: 1 });

  const execution = new ExecutionService({
    read: (id) => ({ workflow: { id, name: 'Scoped workflow', nodes: [], edges: [] } }),
    list: () => [],
  });
  assert.equal(execution.resolveWorkflowReference({ workflowId: 'wf_1' }, { scope }).id, 'wf_1');
  assert.equal(execution.getStatus('missing-run', { scope }).status, 'idle');
  assert.equal(execution.cancel('missing-run', { scope }), false);
});

test('broader service interfaces accept scope-aware options without changing single-user results', async () => {
  const scope = { userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' };
  const { AssistantService } = await import('../src/modules/assistant/assistant.service.ts');
  const { ImagesService } = await import('../src/modules/images/images.service.ts');
  const { CapabilitiesService } = await import('../src/modules/capabilities/capabilities.service.ts');
  const { AgentService } = await import('../src/modules/agent/agent.service.ts');

  const assistantRepository = {
    load: (name) => (name === 'gallery' ? [{ id: 'img_1' }] : []),
    save: () => {},
  };
  const assistant = new AssistantService(assistantRepository);
  assert.equal(assistant.getStatus({ scope }).ok, true);
  assert.deepEqual(assistant.getConversations({ scope }), []);
  assert.equal(assistant.getImages({ scope })[0].id, 'img_1');
  assert.equal(assistant.getImages({ scope })[0].ownerUserId, 'single-user');

  let imageScope = null;
  const images = new ImagesService({
    settingsService: { buildRuntimeConfig: () => ({ apiKey: 'demo' }) },
    runImageGeneration: async (_body, runtimeConfig) => {
      imageScope = runtimeConfig.scope;
      return { images: [] };
    },
  });
  assert.deepEqual(await images.generate({ prompt: 'demo' }, { scope }), { images: [] });
  assert.deepEqual(imageScope, scope);

  const capabilities = new CapabilitiesService({
    settingsService: { buildRuntimeConfig: () => ({}) },
    imagesService: { generate: async (_body, options) => ({ scope: options.scope }) },
  });
  assert.deepEqual(await capabilities.image({ prompt: 'demo' }, { scope }), { scope });
  assert.equal(capabilities.getRuntimeCapabilities({ scope }).mode, 'local-web');

  const agent = new AgentService({
    profileService: { getProfiles: () => [] },
    memoryService: { list: () => [] },
    sessionStore: { list: () => [] },
    runtime: {},
    repository: {},
  });
  assert.equal(agent.getStatus({ scope }).ok, true);
  assert.deepEqual(agent.getProfiles({ scope }), []);
  assert.deepEqual(agent.getMemories({ scope }), []);
});

test('new persisted resources carry ownership metadata and old records get fallback ownership', async () => {
  const scope = { userId: 'user_5b', workspaceId: 'workspace_5b', runtimeMode: 'server-single-user' };
  const { WorkflowsService } = await import('../src/modules/workflows/workflows.service.ts');
  const { AgentMemoryService } = await import('../src/modules/agent/agent-memory.service.ts');
  const { AgentSessionStore } = await import('../src/modules/agent/agent-session-store.ts');
  const { AssistantService } = await import('../src/modules/assistant/assistant.service.ts');
  const { FilesService } = await import('../src/modules/files/files.service.ts');

  const workflowRecords = new Map();
  const workflows = new WorkflowsService({
    list: () => Array.from(workflowRecords.values()),
    read: (id) => ({ workflow: workflowRecords.get(id) }),
    save: (id, workflow) => workflowRecords.set(id, workflow),
    delete: () => {},
  });
  const createdWorkflow = workflows.create({
    id: 'wf_scope_owner',
    name: 'Scoped owner workflow',
    nodes: [],
    edges: [],
  }, { scope });
  assert.equal(createdWorkflow.ownerUserId, 'user_5b');
  assert.equal(createdWorkflow.workspaceId, 'workspace_5b');
  assert.deepEqual(createdWorkflow.ownershipScope, scope);
  workflowRecords.set('wf_legacy', { id: 'wf_legacy', name: 'Legacy workflow', nodes: [], edges: [], updatedAt: 1 });
  assert.equal(workflows.getById('wf_legacy', { scope }).ownerUserId, 'user_5b');

  const memoryRepository = {
    records: [],
    loadMemories() { return this.records; },
    saveMemories(records) { this.records = records; },
  };
  const memory = new AgentMemoryService(memoryRepository);
  const write = memory.writeFromTool({
    content: 'User prefers ownership metadata.',
    conversationId: 'conv_5b',
    requestScope: scope,
  });
  assert.equal(write.memory.ownerUserId, 'user_5b');
  assert.equal(memory.list({ scope })[0].workspaceId, 'workspace_5b');
  assert.deepEqual(memory.list({ scope })[0].ownershipScope, scope);

  const sessions = new Map();
  const sessionStore = new AgentSessionStore({
    writeSessionFile: (sessionId, value) => sessions.set(sessionId, value),
    readSessionFile: (sessionId) => sessions.get(sessionId) || null,
  });
  const session = sessionStore.create({ sessionId: 'session_5b', status: 'running', scope });
  assert.equal(session.ownerUserId, 'user_5b');
  assert.equal(session.workspaceId, 'workspace_5b');
  assert.deepEqual(session.ownershipScope, scope);

  const assistantData = { conversations: [], gallery: [], videos: [] };
  const assistant = new AssistantService({
    load: (type) => assistantData[type],
    save: (type, data) => { assistantData[type] = data; },
    writeAssistantImage: () => '',
    writeAssistantVideo: () => '',
  });
  assistant.saveConversations([{ id: 'conv_5b' }], { scope });
  assert.equal(assistantData.conversations[0].ownerUserId, 'user_5b');
  const imageResult = assistant.saveImage({ id: 'img_5b', url: 'https://example.com/image.png' }, { scope });
  assert.equal(imageResult.localUrl, 'https://example.com/image.png');
  assert.equal(assistantData.gallery[0].workspaceId, 'workspace_5b');

  const files = new FilesService({
    decodeOriginalName: (value) => value,
    uploadedFileExists: () => true,
    uploadExists: () => true,
    listGeneratedOutputs: async (options) => [{ id: 'out_5b', ownerUserId: options.scope.userId }],
  });
  const upload = await files.buildUploadResponse({
    filename: 'file_5b.txt',
    path: 'file_5b.txt',
    originalname: 'file_5b.txt',
    mimetype: 'text/plain',
    size: 12,
  }, { scope });
  assert.equal(upload.url, '/api/files/file_5b.txt');
  assert.equal((await files.listGeneratedOutputs({ scope }))[0].ownerUserId, 'user_5b');
});

test('scoped storage namespace preserves current single-user layout and prepares workspace paths', async () => {
  const { getStoragePaths } = await import('../src/platform/storage/storage-paths.ts');
  const {
    createStorageNamespace,
    getScopedStoragePaths,
    isDefaultStorageScope,
  } = await import('../src/platform/storage/scoped-storage.ts');

  const base = getStoragePaths();
  const defaultPaths = getScopedStoragePaths({ userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' });
  assert.equal(isDefaultStorageScope(defaultPaths.scopeNamespace.scope), true);
  assert.equal(defaultPaths.root, base.root);
  assert.equal(defaultPaths.workflowsDir, base.workflowsDir);
  assert.equal(defaultPaths.generatedDir, base.generatedDir);

  const futureScope = { userId: 'user 42/unsafe', workspaceId: 'workspace:demo', runtimeMode: 'server-multi-user' };
  const namespace = createStorageNamespace(futureScope);
  assert.equal(namespace.isDefaultScope, false);
  assert.deepEqual(namespace.namespaceParts, ['scopes', 'v1', 'workspaces', 'workspace_demo', 'users', 'user_42_unsafe']);
  assert.match(getScopedStoragePaths(futureScope).workflowsDir, /scopes[\\/]+v1[\\/]+workspaces[\\/]+workspace_demo[\\/]+users[\\/]+user_42_unsafe[\\/]+workflows$/);
});

test('scope-aware file and workflow reads filter by ownership extension points', async () => {
  const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-single-user' };
  const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-single-user' };
  const { WorkflowsService } = await import('../src/modules/workflows/workflows.service.ts');
  const { FilesService } = await import('../src/modules/files/files.service.ts');

  const workflowRecords = [
    { id: 'wf_a', name: 'A', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'workspace_a' },
    { id: 'wf_b', name: 'B', nodes: [], edges: [], ownerUserId: 'user_b', workspaceId: 'workspace_b' },
    { id: 'wf_legacy', name: 'Legacy', nodes: [], edges: [] },
  ];
  const workflows = new WorkflowsService({
    list: () => workflowRecords,
    read: (id) => ({ workflow: workflowRecords.find((workflow) => workflow.id === id) }),
    save: () => {},
    delete: () => {},
  });
  assert.deepEqual(workflows.list({ scope: scopeA }).map((item) => item.id), ['wf_a', 'wf_legacy']);
  assert.deepEqual(workflows.list({ scope: scopeB }).map((item) => item.id), ['wf_b', 'wf_legacy']);
  assert.equal(workflows.getById('wf_a', { scope: scopeA }).id, 'wf_a');
  assert.throws(() => workflows.getById('wf_a', { scope: scopeB }), /工作流不存在|not found/i);
  assert.throws(() => workflows.export('wf_a', { scope: scopeB }), /工作流不存在|not found/i);

  let uploadDirScope = null;
  const files = new FilesService({
    getUploadsDir: (options) => {
      uploadDirScope = options.scope;
      return 'uploads';
    },
    createUploadName: () => 'file.txt',
    listGeneratedOutputs: async (options) => [
      { id: 'out_a', ownerUserId: options.scope.userId, workspaceId: options.scope.workspaceId },
    ],
  });
  files.createUploader();
  assert.deepEqual(await files.listGeneratedOutputs({ scope: scopeA }), [{
    id: 'out_a',
    ownerUserId: 'user_a',
    workspaceId: 'workspace_a',
  }]);
  assert.equal(uploadDirScope, null);
});

test('scoped output file resolution uses request scope while default scope keeps legacy layout', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('scoped-static', {
    APP_RUNTIME_MODE: 'server-single-user',
  });
  try {
    const { getStoragePaths } = await import(`../src/platform/storage/storage-paths.ts?static=${Date.now()}`);
    const { getScopedStoragePaths, ensureScopedStorageDirectories } = await import(`../src/platform/storage/scoped-storage.ts?static=${Date.now()}`);
    const scopeA = { userId: 'user_static_a', workspaceId: 'workspace_static', runtimeMode: 'server-single-user' };
    const defaultPaths = getStoragePaths();
    const scopedPaths = ensureScopedStorageDirectories(scopeA);

    fs.mkdirSync(path.join(defaultPaths.generatedDir, 'text'), { recursive: true });
    fs.mkdirSync(path.join(scopedPaths.generatedDir, 'text'), { recursive: true });
    fs.writeFileSync(path.join(defaultPaths.generatedDir, 'text', 'visible.txt'), 'legacy-output', 'utf8');
    fs.writeFileSync(path.join(scopedPaths.generatedDir, 'text', 'visible.txt'), 'scoped-output', 'utf8');

    assert.equal(getScopedStoragePaths().generatedDir, defaultPaths.generatedDir);

    const legacy = await requestText(baseUrl, '/api/outputs/text/visible.txt');
    assert.equal(legacy.status, 200);
    assert.equal(legacy.text, 'legacy-output');

    const scoped = await requestText(baseUrl, '/api/outputs/text/visible.txt', {
      headers: {
        'x-suelr-user-id': scopeA.userId,
        'x-suelr-workspace-id': scopeA.workspaceId,
      },
    });
    assert.equal(scoped.status, 200);
    assert.equal(scoped.text, 'scoped-output');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
