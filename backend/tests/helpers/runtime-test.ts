// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createStorageDir(prefix: string, name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `suelr-${prefix}-${name}-`));
  return root;
}

export async function createTestServer(
  name: string,
  {
    prefix = 'http',
    queryKey = 'test',
    env = {},
    prepareStorage,
  }: {
    prefix?: string;
    queryKey?: string;
    env?: Record<string, string>;
    prepareStorage?: (root: string) => void;
  } = {},
) {
  const root = createStorageDir(prefix, name);
  if (typeof prepareStorage === 'function') prepareStorage(root);
  const previousEnv: Record<string, string | undefined> = {};
  const nextEnv = {
    APP_CONFIG_DIR: root,
    APP_STORAGE_BOOTSTRAP_FILE: path.join(root, 'config', 'bootstrap.json'),
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: '1',
    ...env,
  };
  for (const [key, value] of Object.entries(nextEnv)) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const nonce = `${Date.now()}-${Math.random()}`;
  const { createApp } = await import(`../../src/app/create-app.ts?${queryKey}=${nonce}`);
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        root,
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

export async function requestJson(baseUrl: string, pathname: string, options: RequestInit = {}) {
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

export function assertEnvelopeShape(body: unknown) {
  assert.equal(typeof body?.success, 'boolean');
  const allowedKeys = body.success ? ['data', 'success'] : ['error', 'success'];
  assert.deepEqual(Object.keys(body).sort(), allowedKeys);
}
