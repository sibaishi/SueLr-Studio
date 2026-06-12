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

test('request scope defaults to local single-user behavior', async () => {
  const { createRequestScope, summarizeScopeFoundation } = await import('../src/platform/runtime/request-scope.ts');

  assert.deepEqual(createRequestScope({ runtimeMode: 'local-web' }), {
    userId: 'single-user',
    workspaceId: 'default',
    runtimeMode: 'local-web',
  });
  assert.deepEqual(summarizeScopeFoundation(createRequestScope()), {
    enabled: true,
    userId: 'single-user',
    workspaceId: 'default',
    runtimeMode: 'local-web',
    source: 'single-user-default',
  });
});

test('HTTP status ignores spoofed scope headers in local runtime', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('headers', {
    APP_RUNTIME_MODE: 'local-web',
  });
  try {
    const status = await requestJson(baseUrl, '/api/status', {
      headers: {
        'x-suelr-user-id': 'user_123',
        'x-suelr-workspace-id': 'workspace_abc',
        'x-suelr-runtime-mode': 'local-web',
      },
    });
    assert.equal(status.status, 200);
    assert.deepEqual(status.body.data.scope, {
      enabled: true,
      userId: 'single-user',
      workspaceId: 'default',
      runtimeMode: 'local-web',
      source: 'single-user-default',
    });
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('request logger entries carry local request scope metadata', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('logs', {
    APP_RUNTIME_MODE: 'local-web',
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
    assert.equal(started?.scope?.runtimeMode, 'local-web');
  } finally {
    console.log = originalLog;
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
