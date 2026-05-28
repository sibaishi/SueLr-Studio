// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `auth-http-${name}-${Date.now()}`);
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

  const { createApp } = await import(`../src/app/create-app.ts?auth=${Date.now()}-${Math.random()}`);
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

test('auth HTTP routes login, expose current user, and logout', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('flow');
  try {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.success, true);
    assert.equal(login.body.data.user.username, 'demo-user');
    assert.equal(login.body.data.password, undefined);
    assert.equal(login.body.data.sessionToken, undefined);

    const cookie = readSessionCookie(login);
    assert.match(cookie, /^suelr_session=/);

    const me = await requestJson(baseUrl, '/api/auth/me', {
      headers: { Cookie: cookie },
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.username, 'demo-user');
    assert.equal(me.body.data.user.passwordHash, undefined);

    const logout = await requestJson(baseUrl, '/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.body.success, true);

    const afterLogout = await requestJson(baseUrl, '/api/auth/me', {
      headers: { Cookie: cookie },
    });
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.body.error.code, 'AUTH_REQUIRED');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('auth HTTP routes register pending users and gate login by status', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('register-status', {
    APP_AUTH_BOOTSTRAP_USERNAME: '',
    APP_AUTH_BOOTSTRAP_PASSWORD: '',
  });
  try {
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'new-user',
        password: 'new-password-123',
        email: 'NEW.User@example.COM',
      }),
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.body.success, true);
    assert.equal(registered.body.data.user.username, 'new-user');
    assert.equal(registered.body.data.user.email, 'new.user@example.com');
    assert.equal(registered.body.data.user.status, 'pending');
    assert.equal(registered.body.data.user.passwordHash, undefined);

    const pendingLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'new-user', password: 'new-password-123' }),
    });
    assert.equal(pendingLogin.status, 401);
    assert.equal(pendingLogin.body.error.code, 'AUTH_USER_PENDING');

    const duplicateUsername = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'NEW-USER', password: 'new-password-123' }),
    });
    assert.equal(duplicateUsername.status, 409);
    assert.equal(duplicateUsername.body.error.code, 'AUTH_USERNAME_TAKEN');

    const duplicateEmail = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'other-user', password: 'new-password-123', email: 'new.user@example.com' }),
    });
    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.body.error.code, 'AUTH_EMAIL_TAKEN');

    const invalidEmail = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'email-user', password: 'new-password-123', email: 'not-an-email' }),
    });
    assert.equal(invalidEmail.status, 400);
    assert.equal(invalidEmail.body.error.code, 'VALIDATION_ERROR');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server-multi-user protects data APIs while health stays public', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('protected');
  try {
    const health = await requestJson(baseUrl, '/api/health');
    assert.equal(health.status, 200);

    const workflows = await requestJson(baseUrl, '/api/workflows');
    assert.equal(workflows.status, 401);
    assert.equal(workflows.body.error.code, 'AUTH_REQUIRED');

    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    const cookie = readSessionCookie(login);

    const authenticatedWorkflows = await requestJson(baseUrl, '/api/workflows', {
      headers: { Cookie: cookie },
    });
    assert.equal(authenticatedWorkflows.status, 200);
    assert.equal(authenticatedWorkflows.body.success, true);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server-multi-user leaves admin console APIs on admin access key authentication', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('admin-console', {
    APP_ADMIN_ACCESS_KEY: 'admin-secret',
  });
  try {
    const denied = await requestJson(baseUrl, '/api/admin/settings');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'ADMIN_ACCESS_DENIED');

    const validation = await requestJson(baseUrl, '/api/admin/access/validate', {
      method: 'POST',
      body: JSON.stringify({ accessKey: 'admin-secret' }),
    });
    assert.equal(validation.status, 200);
    assert.equal(validation.body.data.valid, true);
    assert.equal(validation.body.data.requiresAccessKey, true);

    const settings = await requestJson(baseUrl, '/api/admin/settings', {
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(settings.status, 200);
    assert.equal(settings.body.success, true);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server-multi-user derives request scope from authenticated session instead of spoofed headers', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('trusted-scope');
  try {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    const cookie = readSessionCookie(login);
    const userId = login.body.data.user.id;

    const status = await requestJson(baseUrl, '/api/status', {
      headers: {
        Cookie: cookie,
        'X-SueLr-User-Id': 'attacker',
        'X-SueLr-Workspace-Id': 'other-workspace',
      },
    });

    assert.equal(status.status, 200);
    assert.equal(status.body.data.scope.userId, userId);
    assert.equal(status.body.data.scope.workspaceId, 'default');
    assert.equal(status.body.data.scope.source, 'request');
    assert.notEqual(status.body.data.scope.userId, 'attacker');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('runtime capabilities expose auth requirement and current user', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('runtime-auth');
  try {
    const anonymous = await requestJson(baseUrl, '/api/capabilities/runtime');
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.data.auth.required, true);
    assert.equal(anonymous.body.data.auth.mode, 'session');
    assert.equal(anonymous.body.data.auth.user, null);

    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-user', password: 'correct-password' }),
    });
    const cookie = readSessionCookie(login);

    const authenticated = await requestJson(baseUrl, '/api/capabilities/runtime', {
      headers: { Cookie: cookie },
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.body.data.auth.user.username, 'demo-user');
    assert.equal(authenticated.body.data.auth.user.id, login.body.data.user.id);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
