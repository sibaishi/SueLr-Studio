// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `admin-users-${name}-${Date.now()}`);
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

  const { createApp } = await import(`../src/app/create-app.ts?adminUsers=${Date.now()}-${Math.random()}`);
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

test('admin user governance APIs require admin access key and not user session', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('guard');
  try {
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'pending-user', password: 'password-123' }),
    });
    assert.equal(registered.status, 200);

    const denied = await requestJson(baseUrl, '/api/admin/users');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'ADMIN_ACCESS_DENIED');

    const listed = await requestJson(baseUrl, '/api/admin/users?status=pending', {
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.success, true);
    assert.equal(listed.body.data.users.length, 1);
    assert.equal(listed.body.data.users[0].username, 'pending-user');
    assert.equal(listed.body.data.users[0].passwordHash, undefined);
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin user governance can approve, reject, disable, and enable users', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('transitions');
  try {
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'review-user', password: 'password-123', email: 'review@example.com' }),
    });
    const userId = registered.body.data.user.id;

    const approve = await requestJson(baseUrl, `/api/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.user.status, 'active');

    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'review-user', password: 'password-123' }),
    });
    assert.equal(login.status, 200);
    const cookie = readSessionCookie(login);
    assert.match(cookie, /^suelr_session=/);

    const disable = await requestJson(baseUrl, `/api/admin/users/${userId}/disable`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(disable.status, 200);
    assert.equal(disable.body.data.user.status, 'disabled');

    const oldSession = await requestJson(baseUrl, '/api/auth/me', {
      headers: { Cookie: cookie },
    });
    assert.equal(oldSession.status, 401);
    assert.equal(oldSession.body.error.code, 'AUTH_REQUIRED');

    const disabledLogin = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'review-user', password: 'password-123' }),
    });
    assert.equal(disabledLogin.status, 401);
    assert.equal(disabledLogin.body.error.code, 'AUTH_USER_DISABLED');

    const enable = await requestJson(baseUrl, `/api/admin/users/${userId}/enable`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(enable.status, 200);
    assert.equal(enable.body.data.user.status, 'active');

    const reject = await requestJson(baseUrl, `/api/admin/users/${userId}/reject`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.data.user.status, 'rejected');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin user governance can delete only non-active users with confirmed admin key', async () => {
  const { server, baseUrl, restoreEnv } = await createTestServer('delete');
  try {
    const registered = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'delete-user', password: 'password-123', email: 'delete@example.com' }),
    });
    const userId = registered.body.data.user.id;
    const root = process.env.APP_CONFIG_DIR;

    const approve = await requestJson(baseUrl, `/api/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(approve.status, 200);

    const activeDelete = await requestJson(baseUrl, `/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
      body: JSON.stringify({ confirmAccessKey: 'admin-secret' }),
    });
    assert.equal(activeDelete.status, 400);
    assert.equal(activeDelete.body.error.code, 'ADMIN_ACTIVE_USER_DELETE_FORBIDDEN');

    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'delete-user', password: 'password-123' }),
    });
    assert.equal(login.status, 200);

    const reset = await requestJson(baseUrl, '/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'delete-user' }),
    });
    assert.equal(reset.status, 200);

    const disable = await requestJson(baseUrl, `/api/admin/users/${userId}/disable`, {
      method: 'POST',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
    });
    assert.equal(disable.status, 200);

    const scopedUserDir = path.join(root, 'scopes', 'v1', 'workspaces', 'default', 'users', userId);
    fs.mkdirSync(path.join(scopedUserDir, 'files', 'generated'), { recursive: true });
    fs.writeFileSync(path.join(scopedUserDir, 'files', 'generated', 'owned.txt'), 'owned', 'utf8');

    fs.mkdirSync(path.join(root, 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'workflows', 'owned.json'),
      JSON.stringify({ id: 'owned', ownerUserId: userId, workspaceId: 'default' }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'workflows', 'other.json'),
      JSON.stringify({ id: 'other', ownerUserId: 'other-user', workspaceId: 'default' }, null, 2),
      'utf8',
    );

    fs.mkdirSync(path.join(root, 'assistant'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'assistant', 'conversations.json'),
      JSON.stringify(
        [
          { id: 'owned-conversation', ownerUserId: userId, workspaceId: 'default' },
          { id: 'other-conversation', ownerUserId: 'other-user', workspaceId: 'default' },
        ],
        null,
        2,
      ),
      'utf8',
    );

    const wrongConfirm = await requestJson(baseUrl, `/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
      body: JSON.stringify({ confirmAccessKey: 'wrong-secret' }),
    });
    assert.equal(wrongConfirm.status, 400);
    assert.equal(wrongConfirm.body.error.code, 'ADMIN_DELETE_CONFIRMATION_INVALID');

    const deleted = await requestJson(baseUrl, `/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Access-Key': 'admin-secret' },
      body: JSON.stringify({ confirmAccessKey: 'admin-secret' }),
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.deletedUser.id, userId);
    assert.equal(deleted.body.data.deleted.sessions, 1);
    assert.equal(deleted.body.data.deleted.passwordResetRequests, 1);
    assert.equal(deleted.body.data.deleted.workflows, 1);
    assert.equal(deleted.body.data.deleted.records, 1);
    assert.equal(deleted.body.data.deleted.scopedStorage, true);

    const authState = JSON.parse(fs.readFileSync(path.join(root, 'config', 'auth.json'), 'utf8'));
    assert.equal(authState.users.some((user) => user.id === userId), false);
    assert.equal(authState.sessions.some((session) => session.userId === userId), false);
    assert.equal(authState.passwordResetRequests.some((request) => request.userId === userId), false);
    assert.equal(fs.existsSync(scopedUserDir), false);
    assert.equal(fs.existsSync(path.join(root, 'workflows', 'owned.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'workflows', 'other.json')), true);

    const conversations = JSON.parse(fs.readFileSync(path.join(root, 'assistant', 'conversations.json'), 'utf8'));
    assert.deepEqual(
      conversations.map((item) => item.id),
      ['other-conversation'],
    );
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
