// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `admin-audit-${name}-${Date.now()}`);
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
    APP_ADMIN_ACCESS_KEY: 'admin-secret',
    ...env,
  })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const { createApp } = await import(`../src/app/create-app.ts?adminAudit=${Date.now()}-${Math.random()}`);
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

test('admin audit API records registration, user governance, reset, and migration events', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('events');
  try {
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'User-Agent': 'audit-test' },
      body: JSON.stringify({ username: 'audit-user', password: 'password-123', email: 'audit@example.com' }),
    });
    assert.equal(registered.status, 200);
    const userId = registered.body.data.user.id;

    await requestJson(baseUrl, `/api/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    await requestJson(baseUrl, `/api/admin/users/${userId}/disable`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    await requestJson(baseUrl, `/api/admin/users/${userId}/enable`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });

    const resetRequest = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'audit-user' }),
    });
    assert.equal(resetRequest.status, 200);
    const requestId = resetRequest.body.data.request.id;

    const issued = await requestJson(baseUrl, `/api/admin/password-reset-requests/${requestId}/issue`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(issued.status, 200);

    const completed = await requestJson(baseUrl, '/api/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify({ token: issued.body.data.token, password: 'new-password-123' }),
    });
    assert.equal(completed.status, 200);

    const migration = await requestJson(baseUrl, '/api/admin/legacy-data/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
      body: JSON.stringify({ targetUserId: userId }),
    });
    assert.equal(migration.status, 200);

    const audit = await requestJson(baseUrl, '/api/admin/audit', {
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(audit.status, 200);
    const actions = audit.body.data.entries.map((entry) => entry.action);
    assert.ok(actions.includes('auth.registration.submitted'));
    assert.ok(actions.includes('admin.user.approved'));
    assert.ok(actions.includes('admin.user.disabled'));
    assert.ok(actions.includes('admin.user.enabled'));
    assert.ok(actions.includes('auth.password_reset.requested'));
    assert.ok(actions.includes('admin.password_reset.token_issued'));
    assert.ok(actions.includes('auth.password_reset.token_used'));
    assert.ok(actions.includes('admin.legacy_data.migrated'));

    for (const entry of audit.body.data.entries) {
      assert.equal(entry.password, undefined);
      assert.equal(entry.token, undefined);
      assert.equal(entry.details?.token, undefined);
    }
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin audit records rejected users, revoked reset tokens, and email failures', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('email-failures', {
    EMAIL_PROVIDER: 'smtp',
  });
  try {
    const emailSettings = await requestJson(baseUrl, '/api/admin/settings', {
      method: 'PUT',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
      body: JSON.stringify({
        email: {
          provider: 'smtp',
          from: 'noreply@example.com',
          smtp: { host: '127.0.0.1', port: 1, secure: false },
        },
      }),
    });
    assert.equal(emailSettings.status, 200);

    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'reject-user', password: 'password-123', email: 'reject@example.com' }),
    });
    assert.equal(registered.status, 200);
    const userId = registered.body.data.user.id;

    const rejected = await requestJson(baseUrl, `/api/admin/users/${userId}/reject`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(rejected.status, 200);

    const resetRequest = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'reject-user' }),
    });
    const requestId = resetRequest.body.data.request.id;

    const issued = await requestJson(baseUrl, `/api/admin/password-reset-requests/${requestId}/issue`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(issued.status, 200);

    const revoked = await requestJson(baseUrl, `/api/admin/password-reset-requests/${requestId}/revoke`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(revoked.status, 200);

    const audit = await requestJson(baseUrl, '/api/admin/audit', {
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    const actions = audit.body.data.entries.map((entry) => entry.action);
    assert.ok(actions.includes('admin.user.rejected'));
    assert.ok(actions.includes('admin.password_reset.token_revoked'));
    assert.ok(actions.includes('notification.email.failed'));
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
