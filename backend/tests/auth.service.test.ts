// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `auth-service-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function withAuthService(name, callback) {
  const root = createStorageDir(name);
  const previousEnv = {
    APP_CONFIG_DIR: process.env.APP_CONFIG_DIR,
    APP_STORAGE_BOOTSTRAP_FILE: process.env.APP_STORAGE_BOOTSTRAP_FILE,
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION,
    APP_AUTH_BOOTSTRAP_USERNAME: process.env.APP_AUTH_BOOTSTRAP_USERNAME,
    APP_AUTH_BOOTSTRAP_PASSWORD: process.env.APP_AUTH_BOOTSTRAP_PASSWORD,
  };
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  process.env.APP_AUTH_BOOTSTRAP_USERNAME = 'demo-user';
  process.env.APP_AUTH_BOOTSTRAP_PASSWORD = 'correct-password';

  try {
    const module = await import(`../src/modules/auth/auth.service.ts?test=${Date.now()}-${Math.random()}`);
    await callback(module.authService, root);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('auth service logs in bootstrap user and returns public user only', async () => {
  await withAuthService('login', async (authService, root) => {
    const result = await authService.login({
      username: 'demo-user',
      password: 'correct-password',
      userAgent: 'node-test',
      clientIp: '127.0.0.1',
    });

    assert.equal(result.user.username, 'demo-user');
    assert.equal(result.user.passwordHash, undefined);
    assert.equal(result.sessionToken.length > 40, true);
    assert.equal(result.session.id.length > 10, true);

    const stored = JSON.parse(fs.readFileSync(path.join(root, 'config', 'auth.json'), 'utf8'));
    assert.equal(stored.users.length, 1);
    assert.notEqual(stored.users[0].passwordHash, 'correct-password');
    assert.equal(JSON.stringify(stored).includes(result.sessionToken), false);
  });
});

test('auth service rejects invalid credentials and can invalidate sessions', async () => {
  await withAuthService('invalid', async (authService) => {
    await assert.rejects(
      () => authService.login({ username: 'demo-user', password: 'wrong-password' }),
      /用户名或密码无效|AUTH_INVALID_CREDENTIALS/,
    );

    const result = await authService.login({ username: 'demo-user', password: 'correct-password' });
    const currentUser = authService.authenticateSession(result.sessionToken);
    assert.equal(currentUser?.username, 'demo-user');

    authService.logout(result.sessionToken);
    assert.equal(authService.authenticateSession(result.sessionToken), null);
  });
});

test('execution service hides and refuses cancellation for runs outside request scope', async () => {
  const { ExecutionService } = await import('../src/modules/execution/execution.service.ts');
  const execution = new ExecutionService({
    read: (id) => ({ workflow: { id, name: 'Scoped workflow', nodes: [], edges: [] } }),
    list: () => [
      { id: 'wf_a', name: 'A', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'default' },
      { id: 'wf_b', name: 'B', nodes: [], edges: [], ownerUserId: 'user_b', workspaceId: 'default' },
    ],
  });
  const abortController = new AbortController();
  execution.runningExecutions.set('run_a', {
    runId: 'run_a',
    workflowId: 'wf_a',
    source: 'persisted',
    snapshotVersion: 1,
    abortController,
    ownerUserId: 'user_a',
    workspaceId: 'default',
    ownershipScope: { userId: 'user_a', workspaceId: 'default', runtimeMode: 'server-multi-user' },
  });

  const scopeB = { userId: 'user_b', workspaceId: 'default', runtimeMode: 'server-multi-user' };
  assert.equal(execution.getStatus('run_a', { scope: scopeB }).status, 'idle');
  assert.equal(execution.cancel('run_a', { scope: scopeB }), false);
  assert.equal(abortController.signal.aborted, false);

  const scopeA = { userId: 'user_a', workspaceId: 'default', runtimeMode: 'server-multi-user' };
  assert.equal(execution.getStatus('run_a', { scope: scopeA }).status, 'running');
  assert.equal(execution.cancel('run_a', { scope: scopeA }), true);
  assert.equal(abortController.signal.aborted, true);
});

test('execution service resolves workflow references only inside current scope', async () => {
  const { ExecutionService } = await import('../src/modules/execution/execution.service.ts');
  const execution = new ExecutionService({
    read: (id) => ({
      workflow: { id, name: 'Hidden', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'default' },
    }),
    list: () => [
      { id: 'wf_a', name: 'Shared name', nodes: [], edges: [], ownerUserId: 'user_a', workspaceId: 'default' },
      { id: 'wf_b', name: 'Shared name', nodes: [], edges: [], ownerUserId: 'user_b', workspaceId: 'default' },
    ],
  });
  const scopeB = { userId: 'user_b', workspaceId: 'default', runtimeMode: 'server-multi-user' };

  assert.throws(() => execution.resolveWorkflowReference({ workflowId: 'wf_a' }, { scope: scopeB }), /not found/i);
  assert.equal(execution.resolveWorkflowReference({ workflowName: 'Shared name' }, { scope: scopeB }).id, 'wf_b');
});
