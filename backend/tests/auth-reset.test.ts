// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `auth-reset-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name) {
  const root = createStorageDir(name);
  const previousEnv = {};
  for (const [key, value] of Object.entries({
    APP_CONFIG_DIR: root,
    APP_STORAGE_BOOTSTRAP_FILE: path.join(root, 'config', 'bootstrap.json'),
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: '1',
    APP_RUNTIME_MODE: 'server-multi-user',
    APP_ADMIN_ACCESS_KEY: 'admin-secret',
  })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const { createApp } = await import(`../src/app/create-app.ts?reset=${Date.now()}-${Math.random()}`);
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

async function createActiveUser(baseUrl) {
  const registered = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'reset-user', password: 'old-password-123', email: 'reset@example.com' }),
  });
  const userId = registered.body.data.user.id;
  await requestJson(baseUrl, `/api/admin/users/${userId}/approve`, {
    method: 'POST',
    headers: { 'X-Admin-Access-Key': 'admin-secret' },
  });
  return userId;
}

test('password reset request creates pending request without leaking token', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('request');
  try {
    await createActiveUser(baseUrl);

    const requested = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'reset@example.com' }),
    });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.data.request.status, 'pending');
    assert.equal(requested.body.data.request.email, 'reset@example.com');
    assert.equal(requested.body.data.token, undefined);

    const listed = await requestJson(baseUrl, '/api/admin/password-reset-requests', {
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.requests.length, 1);
    assert.equal(listed.body.data.requests[0].username, 'reset-user');
    assert.equal(listed.body.data.requests[0].tokenHash, undefined);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin can issue revoke and complete one-time password reset token', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('complete');
  try {
    await createActiveUser(baseUrl);
    const requested = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'reset-user' }),
    });
    const requestId = requested.body.data.request.id;

    const issued = await requestJson(baseUrl, `/api/admin/password-reset-requests/${requestId}/issue`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(issued.status, 200);
    assert.equal(issued.body.data.request.status, 'issued');
    assert.equal(typeof issued.body.data.token, 'string');
    assert.equal(issued.body.data.request.tokenHash, undefined);

    const completed = await requestJson(baseUrl, '/api/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify({ token: issued.body.data.token, password: 'new-password-123' }),
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.data.ok, true);

    const oldLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'reset-user', password: 'old-password-123' }),
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'reset-user', password: 'new-password-123' }),
    });
    assert.equal(newLogin.status, 200);

    const reused = await requestJson(baseUrl, '/api/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify({ token: issued.body.data.token, password: 'another-password-123' }),
    });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.error.code, 'AUTH_RESET_TOKEN_INVALID');

    const secondRequest = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'reset-user' }),
    });
    const revoke = await requestJson(baseUrl, `/api/admin/password-reset-requests/${secondRequest.body.data.request.id}/revoke`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(revoke.status, 200);
    assert.equal(revoke.body.data.request.status, 'revoked');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
