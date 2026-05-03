import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';

function resetStorageEnv() {
  delete process.env.APP_CONFIG_DIR;
  delete process.env.APP_STORAGE_DIR;
}

function isWithin(baseDir, targetDir) {
  const base = path.resolve(baseDir).toLowerCase();
  const target = path.resolve(targetDir).toLowerCase();
  return target === base || target.startsWith(`${base}${path.sep}`);
}

test('storage root defaults to the current user config directory', async () => {
  resetStorageEnv();
  const { getDefaultConfigRoot, getStorageRoot, PROJECT_ROOT } = await import(`../src/platform/storage/storage-root.js?test=${Date.now()}`);

  assert.equal(getStorageRoot(), getDefaultConfigRoot());
  assert.equal(isWithin(PROJECT_ROOT, getStorageRoot()), false);
});

test('APP_CONFIG_DIR overrides legacy APP_STORAGE_DIR', async () => {
  process.env.APP_CONFIG_DIR = path.resolve('C:/tmp/suelr-config');
  process.env.APP_STORAGE_DIR = 'storage';

  const { getStorageRoot } = await import(`../src/platform/storage/storage-root.js?test=${Date.now()}`);

  assert.equal(getStorageRoot(), path.resolve('C:/tmp/suelr-config'));
  resetStorageEnv();
});

test('APP_STORAGE_DIR remains supported for existing deployments', async () => {
  resetStorageEnv();
  process.env.APP_STORAGE_DIR = 'storage';

  const { getStorageRoot, PROJECT_ROOT } = await import(`../src/platform/storage/storage-root.js?test=${Date.now()}`);

  assert.equal(getStorageRoot(), path.join(PROJECT_ROOT, 'storage'));
  resetStorageEnv();
});
