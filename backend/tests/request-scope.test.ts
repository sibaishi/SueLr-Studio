// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createTestServer as createRuntimeTestServer, requestJson } from './helpers/runtime-test.ts';

const createTestServer = (name, env = {}) =>
  createRuntimeTestServer(name, { prefix: 'request-scope', queryKey: 'scope', env });

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
    source: 'local-single-user',
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
      source: 'local-single-user',
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
