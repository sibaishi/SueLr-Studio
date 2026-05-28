// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `phase6-${name}-${Date.now()}`);
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
    APP_RUNTIME_MODE: 'server-multi-user',
    APP_AUTH_BOOTSTRAP_USERNAME: 'demo-user',
    APP_AUTH_BOOTSTRAP_PASSWORD: 'correct-password',
    ...env,
  })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const { createApp } = await import(`../src/app/create-app.ts?phase6=${Date.now()}-${Math.random()}`);
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
    headers: response.headers,
    body: await response.json(),
  };
}

function readSessionCookie(response) {
  const cookie = response.headers.get('set-cookie') || '';
  const match = cookie.match(/suelr_session=([^;]+)/);
  return match ? `suelr_session=${match[1]}` : '';
}

test('phase 6 auth matrix requires login and accepts a valid authenticated session', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('auth');
  try {
    const anonymous = await requestJson(baseUrl, '/api/workflows');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, 'AUTH_REQUIRED');

    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    const authenticated = await requestJson(baseUrl, '/api/workflows', {
      headers: { Cookie: readSessionCookie(login) },
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.body.success, true);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('phase 6 request scope matrix ignores spoofed browser identity in multi-user mode', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('scope');
  try {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    const cookie = readSessionCookie(login);
    const status = await requestJson(baseUrl, '/api/status', {
      headers: {
        Cookie: cookie,
        'X-SueLr-User-Id': 'attacker',
        'X-SueLr-Workspace-Id': 'other-workspace',
      },
    });

    assert.equal(status.status, 200);
    assert.equal(status.body.data.scope.userId, login.body.data.user.id);
    assert.notEqual(status.body.data.scope.userId, 'attacker');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('phase 6 workflow matrix allows owner access and rejects cross-user operations', async () => {
  const { WorkflowsService } = await import('../src/modules/workflows/workflows.service.ts');
  const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-multi-user' };
  const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-multi-user' };
  const records = new Map([
    ['wf_a', { id: 'wf_a', name: 'A', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'workspace_a' }],
    ['wf_b', { id: 'wf_b', name: 'B', nodes: [], edges: [], ownerUserId: 'user_b', workspaceId: 'workspace_b' }],
  ]);
  const workflows = new WorkflowsService({
    list: () => Array.from(records.values()),
    read: (id) => ({ workflow: records.get(id) }),
    save: (id, workflow) => records.set(id, workflow),
    delete: (id) => records.delete(id),
  });

  assert.equal(workflows.getById('wf_a', { scope: scopeA }).id, 'wf_a');
  assert.deepEqual(workflows.list({ scope: scopeB }).map((workflow) => workflow.id), ['wf_b']);
  assert.throws(() => workflows.update('wf_a', { name: 'stolen' }, { scope: scopeB }), { code: 'WORKFLOW_NOT_FOUND' });
  assert.throws(() => workflows.delete('wf_a', { scope: scopeB }), { code: 'WORKFLOW_NOT_FOUND' });
  assert.equal(records.get('wf_a').name, 'A');
});

test('phase 6 files matrix scopes generated output listing and cleanup', async () => {
  const root = createStorageDir('files');
  const previousConfigDir = process.env.APP_CONFIG_DIR;
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  try {
    const { FilesRepository } = await import(`../src/modules/files/files.repository.ts?phase6=${Date.now()}`);
    const repository = new FilesRepository();
    const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-multi-user' };
    const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-multi-user' };
    const { ensureScopedStorageDirectories } = await import(`../src/platform/storage/scoped-storage.ts?phase6=${Date.now()}`);
    const pathsA = ensureScopedStorageDirectories(scopeA);
    const pathsB = ensureScopedStorageDirectories(scopeB);

    fs.mkdirSync(path.join(pathsA.generatedDir, 'text'), { recursive: true });
    fs.mkdirSync(path.join(pathsB.generatedDir, 'text'), { recursive: true });
    fs.writeFileSync(path.join(pathsA.generatedDir, 'text', 'a.txt'), 'A', 'utf8');
    fs.writeFileSync(path.join(pathsB.generatedDir, 'text', 'b.txt'), 'B', 'utf8');

    assert.deepEqual((await repository.listGeneratedOutputs({ scope: scopeA })).map((item) => item.name), ['a.txt']);
    assert.deepEqual(repository.clearGeneratedOutputs({ scope: scopeA }), { removed: 1 });
    assert.equal(fs.existsSync(path.join(pathsA.generatedDir, 'text', 'a.txt')), false);
    assert.equal(fs.existsSync(path.join(pathsB.generatedDir, 'text', 'b.txt')), true);
  } finally {
    if (previousConfigDir === undefined) delete process.env.APP_CONFIG_DIR;
    else process.env.APP_CONFIG_DIR = previousConfigDir;
  }
});

test('phase 6 execution matrix hides status and cancellation across users', async () => {
  const { ExecutionService } = await import('../src/modules/execution/execution.service.ts');
  const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-multi-user' };
  const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-multi-user' };
  const execution = new ExecutionService({
    read: (id) => ({ workflow: { id, name: 'A', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'workspace_a' } }),
    list: () => [],
  });

  execution.runningExecutions.set('run_a', {
    runId: 'run_a',
    workflowId: 'wf_a',
    ownerUserId: 'user_a',
    workspaceId: 'workspace_a',
    ownershipScope: scopeA,
    status: 'running',
    abortController: new AbortController(),
    startedAt: Date.now(),
  });

  assert.equal(execution.getStatus('run_a', { scope: scopeA }).status, 'running');
  assert.equal(execution.getStatus('run_a', { scope: scopeB }).status, 'idle');
  assert.equal(execution.cancel('run_a', { scope: scopeB }), false);
  assert.equal(execution.cancel('run_a', { scope: scopeA }), true);
});

test('phase 6 assistant matrix filters reads and preserves other users on delete and clear', async () => {
  const { AssistantService } = await import('../src/modules/assistant/assistant.service.ts');
  const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-multi-user' };
  const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-multi-user' };
  const data = {
    conversations: [
      { id: 'conv_a', ownerUserId: 'user_a', workspaceId: 'workspace_a' },
      { id: 'conv_b', ownerUserId: 'user_b', workspaceId: 'workspace_b' },
    ],
    gallery: [
      { id: 'img_a', ownerUserId: 'user_a', workspaceId: 'workspace_a' },
      { id: 'img_b', ownerUserId: 'user_b', workspaceId: 'workspace_b' },
    ],
    videos: [
      { id: 'vid_a', ownerUserId: 'user_a', workspaceId: 'workspace_a' },
      { id: 'vid_b', ownerUserId: 'user_b', workspaceId: 'workspace_b' },
    ],
  };
  data.conversations.push({ id: 'conv_legacy' });
  const service = new AssistantService({
    load: (type) => data[type],
    save: (type, next) => {
      data[type] = next;
    },
    deleteGeneratedFile: () => {},
  });

  assert.deepEqual(service.getConversations({ scope: scopeA }).map((item) => item.id), ['conv_a']);
  assert.deepEqual(
    service
      .getConversations({ scope: { userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' } })
      .map((item) => item.id),
    ['conv_legacy'],
  );
  service.deleteConversation('conv_a', { scope: scopeB });
  assert.deepEqual(data.conversations.map((item) => item.id), ['conv_a', 'conv_b', 'conv_legacy']);
  service.deleteConversation('conv_a', { scope: scopeA });
  assert.deepEqual(data.conversations.map((item) => item.id), ['conv_b', 'conv_legacy']);

  service.clearImages({ scope: scopeA });
  assert.deepEqual(data.gallery.map((item) => item.id), ['img_b']);
  service.deleteVideo('vid_b', { scope: scopeA });
  assert.deepEqual(data.videos.map((item) => item.id), ['vid_a', 'vid_b']);
});

test('phase 6 agent matrix filters memories and sessions by request scope', async () => {
  const { AgentMemoryService } = await import('../src/modules/agent/agent-memory.service.ts');
  const { AgentSessionStore } = await import('../src/modules/agent/agent-session-store.ts');
  const { AgentService } = await import('../src/modules/agent/agent.service.ts');
  const scopeA = { userId: 'user_a', workspaceId: 'workspace_a', runtimeMode: 'server-multi-user' };
  const scopeB = { userId: 'user_b', workspaceId: 'workspace_b', runtimeMode: 'server-multi-user' };
  let memories = [
    {
      id: 'mem_a',
      scope: 'global',
      source: 'manual',
      content: 'User A prefers concise answers.',
      tags: [],
      importance: 1,
      createdAt: 1,
      updatedAt: 1,
      ownerUserId: 'user_a',
      workspaceId: 'workspace_a',
    },
    {
      id: 'mem_b',
      scope: 'global',
      source: 'manual',
      content: 'User B prefers detailed answers.',
      tags: [],
      importance: 1,
      createdAt: 2,
      updatedAt: 2,
      ownerUserId: 'user_b',
      workspaceId: 'workspace_b',
    },
    {
      id: 'mem_legacy',
      scope: 'global',
      source: 'manual',
      content: 'Legacy memory without ownership.',
      tags: [],
      importance: 1,
      createdAt: 3,
      updatedAt: 3,
    },
  ];
  const memoryService = new AgentMemoryService({
    loadMemories: () => memories,
    saveMemories: (next) => {
      memories = next;
    },
  });
  const sessions = new Map();
  const sessionStore = new AgentSessionStore({
    writeSessionFile: (sessionId, value) => sessions.set(sessionId, value),
    readSessionFile: (sessionId) => sessions.get(sessionId) || null,
  });
  sessionStore.create({ sessionId: 'session_a', status: 'running', scope: scopeA });
  sessionStore.create({ sessionId: 'session_b', status: 'running', scope: scopeB });
  const agent = new AgentService({
    memoryService,
    sessionStore,
    profileService: { getProfiles: () => [] },
    runtime: {},
    repository: {},
  });

  assert.deepEqual(agent.getMemories({ scope: scopeA }).map((item) => item.id), ['mem_a']);
  assert.deepEqual(
    agent
      .getMemories({ scope: { userId: 'single-user', workspaceId: 'default', runtimeMode: 'local-web' } })
      .map((item) => item.id),
    ['mem_legacy'],
  );
  agent.deleteMemory('mem_a', { scope: scopeB });
  assert.deepEqual(memories.map((item) => item.id), ['mem_a', 'mem_b', 'mem_legacy']);
  agent.clearMemories({ scope: scopeA });
  assert.deepEqual(memories.map((item) => item.id), ['mem_b', 'mem_legacy']);
  assert.equal(agent.getSession('session_a', { scope: scopeA }).sessionId, 'session_a');
  assert.equal(agent.getSession('session_a', { scope: scopeB }), null);
  assert.throws(() => agent.cancelSession('session_a', { scope: scopeB }), { code: 'AGENT_SESSION_NOT_FOUND' });
});

test('phase 6 settings matrix keeps server settings redacted and protected', async () => {
  const { SettingsService } = await import('../src/modules/settings/settings.service.ts');
  const repository = {
    readStorageSettings: () => ({
      effectiveRoot: 'C:/secret/root',
      defaultRoot: 'C:/secret/default',
      customRoot: 'C:/secret/custom',
      envOverride: 'C:/secret/env',
      legacyRoot: 'C:/secret/legacy',
      source: 'custom',
    }),
    updateStorageSettings: (patch) => patch,
  };
  const serverSettings = new SettingsService(repository, {
    getRuntimeCapabilities: () => ({ mode: 'server-multi-user', canSelectDirectory: false }),
  });
  const storage = serverSettings.getStorageSettings();
  assert.equal(storage.effectiveRoot, '[server-managed]');
  assert.equal(storage.customRoot, '');
  assert.equal(storage.pathsRedacted, true);
  assert.throws(
    () => serverSettings.updateStorageSettings({ customRoot: 'C:/attacker' }),
    { code: 'STORAGE_PATH_MANAGEMENT_UNAVAILABLE' },
  );

  const localSettings = new SettingsService(repository, {
    getRuntimeCapabilities: () => ({ mode: 'local-web', canSelectDirectory: true }),
  });
  assert.equal(localSettings.getStorageSettings().effectiveRoot, 'C:/secret/root');
  assert.deepEqual(localSettings.updateStorageSettings({ customRoot: 'D:/allowed' }), {
    customRoot: 'D:/allowed',
    pathsRedacted: false,
    canManagePath: true,
  });
});

test('phase 6 settings matrix isolates user-owned settings by request scope', async () => {
  const root = createStorageDir('settings-user-scope');
  const previousEnv = {
    APP_CONFIG_DIR: process.env.APP_CONFIG_DIR,
    APP_STORAGE_BOOTSTRAP_FILE: process.env.APP_STORAGE_BOOTSTRAP_FILE,
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION,
  };
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  try {
    const { SettingsService } = await import(`../src/modules/settings/settings.service.ts?phase6settings=${Date.now()}`);
    const service = new SettingsService();
    const scopeA = { userId: 'user_a', workspaceId: 'default', runtimeMode: 'server-multi-user' };
    const scopeB = { userId: 'user_b', workspaceId: 'default', runtimeMode: 'server-multi-user' };

    service.updateStudioSettings({ ui: { theme: 'light' } }, scopeA);

    assert.equal(service.getStudioSettings(scopeA).ui.theme, 'light');
    assert.equal(service.getStudioSettings(scopeB).ui.theme, 'dark');
    assert.throws(
      () => service.updateStudioSettings({ runtime: { tavilyApiKey: 'tvly-user' } }, scopeA),
      { code: 'SETTINGS_DEPLOYMENT_FIELD_FORBIDDEN' },
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
