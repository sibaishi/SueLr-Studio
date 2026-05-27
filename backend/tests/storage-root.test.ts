// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

function resetStorageEnv() {
  delete process.env.APP_CONFIG_DIR;
  delete process.env.APP_STORAGE_DIR;
  delete process.env.APP_STORAGE_BOOTSTRAP_FILE;
}

function isWithin(baseDir, targetDir) {
  const base = path.resolve(baseDir).toLowerCase();
  const target = path.resolve(targetDir).toLowerCase();
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function createBootstrapFile() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-storage-test-'));
  const bootstrapFile = path.join(tempRoot, 'config', 'bootstrap.json');
  process.env.APP_STORAGE_BOOTSTRAP_FILE = bootstrapFile;
  return bootstrapFile;
}

test('storage root defaults to the current user config directory', async () => {
  resetStorageEnv();
  createBootstrapFile();
  const { getDefaultConfigRoot, getStorageRoot, PROJECT_ROOT } = await import(`../src/platform/storage/storage-root.ts?test=${Date.now()}`);

  assert.equal(getStorageRoot(), getDefaultConfigRoot());
  assert.equal(isWithin(PROJECT_ROOT, getStorageRoot()), false);
  resetStorageEnv();
});

test('APP_CONFIG_DIR overrides stored custom path and legacy APP_STORAGE_DIR', async () => {
  resetStorageEnv();
  createBootstrapFile();
  process.env.APP_CONFIG_DIR = path.resolve('C:/tmp/suelr-config');
  process.env.APP_STORAGE_DIR = 'storage';

  const { getStorageRoot } = await import(`../src/platform/storage/storage-root.ts?test=${Date.now()}`);

  assert.equal(getStorageRoot(), path.resolve('C:/tmp/suelr-config'));
  resetStorageEnv();
});

test('stored custom root overrides legacy APP_STORAGE_DIR', async () => {
  resetStorageEnv();
  createBootstrapFile();
  process.env.APP_STORAGE_DIR = 'storage';

  const { writeStoredStorageRootOverride } = await import(`../src/platform/storage/storage-bootstrap.ts?test=${Date.now()}`);
  writeStoredStorageRootOverride(path.resolve('D:/custom-suelr-data'));

  const { getStorageRoot } = await import(`../src/platform/storage/storage-root.ts?test=${Date.now()}`);
  assert.equal(getStorageRoot(), path.resolve('D:/custom-suelr-data'));
  resetStorageEnv();
});

test('APP_STORAGE_DIR remains supported for existing deployments', async () => {
  resetStorageEnv();
  createBootstrapFile();
  process.env.APP_STORAGE_DIR = 'storage';

  const { getStorageRoot, PROJECT_ROOT } = await import(`../src/platform/storage/storage-root.ts?test=${Date.now()}`);

  assert.equal(getStorageRoot(), path.join(PROJECT_ROOT, 'storage'));
  resetStorageEnv();
});
