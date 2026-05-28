// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `auth-rate-limit-${name}-${Date.now()}`);
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

  const { createApp } = await import(`../src/app/create-app.ts?rateLimit=${Date.now()}-${Math.random()}`);
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

test('registration requests are rate-limited by client and identity fingerprint', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('register', {
    APP_AUTH_BOOTSTRAP_USERNAME: '',
    APP_AUTH_BOOTSTRAP_PASSWORD: '',
    APP_RATE_LIMIT_REGISTER_MAX: '1',
  });
  try {
    const first = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.10' },
      body: JSON.stringify({
        username: 'limited-user',
        password: 'password-123',
        email: 'limited@example.com',
      }),
    });
    assert.equal(first.status, 200);

    const sameIp = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.10' },
      body: JSON.stringify({
        username: 'other-user',
        password: 'password-123',
        email: 'other@example.com',
      }),
    });
    assert.equal(sameIp.status, 429);
    assert.equal(sameIp.body.error.code, 'RATE_LIMITED');

    const sameIdentity = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.11' },
      body: JSON.stringify({
        username: 'limited-user',
        password: 'password-123',
        email: 'limited@example.com',
      }),
    });
    assert.equal(sameIdentity.status, 429);
    assert.equal(sameIdentity.body.error.code, 'RATE_LIMITED');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('password reset and failed login requests are rate-limited', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('reset-login', {
    APP_RATE_LIMIT_PASSWORD_RESET_MAX: '1',
    APP_RATE_LIMIT_LOGIN_FAILURE_MAX: '1',
  });
  try {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    assert.equal(login.status, 200);

    const firstReset = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.20' },
      body: JSON.stringify({ usernameOrEmail: 'demo-user' }),
    });
    assert.equal(firstReset.status, 200);

    const secondReset = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.20' },
      body: JSON.stringify({ usernameOrEmail: 'demo-user' }),
    });
    assert.equal(secondReset.status, 429);
    assert.equal(secondReset.body.error.code, 'RATE_LIMITED');

    const failedLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.21' },
      body: JSON.stringify({ username: 'demo-user', password: 'wrong-password' }),
    });
    assert.equal(failedLogin.status, 401);

    const limitedLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.21' },
      body: JSON.stringify({ username: 'demo-user', password: 'wrong-password' }),
    });
    assert.equal(limitedLogin.status, 429);
    assert.equal(limitedLogin.body.error.code, 'RATE_LIMITED');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
