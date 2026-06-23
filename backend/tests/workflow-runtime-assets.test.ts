// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-workflow-runtime-assets-'));
process.env.APP_CONFIG_DIR = storageRoot;
process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(storageRoot, 'config', 'bootstrap.json');

const {
  activateWorkflowRuntime,
  cleanupWorkflowRuntime,
  initializeWorkflowRuntimeStorage,
  retainWorkflowRuntime,
  resolveWorkflowRuntimeAsset,
  resolveWorkflowRuntimeUrl,
  writeWorkflowRuntimeAsset,
} = await import('../src/platform/storage/workflow-runtime-assets.ts');
const { localUrlToDataUrl, localUrlToFilePath } = await import('../src/platform/media/media-resolver.ts');

test('workflow runtime assets remain available after completion until the same workflow runs again', () => {
  initializeWorkflowRuntimeStorage();
  const runId = 'run:temporary-images';
  const workflowId = 'workflow:temporary-images';
  activateWorkflowRuntime(runId, workflowId);

  const source = Buffer.from('temporary-image');
  const url = writeWorkflowRuntimeAsset(runId, source, 'image/png');
  assert.match(url, /^\/api\/runtime\/workflows\/run%3Atemporary-images\/.+\.png$/);

  const filePath = resolveWorkflowRuntimeUrl(url);
  assert.equal(typeof filePath, 'string');
  assert.deepEqual(fs.readFileSync(filePath), source);
  assert.equal(localUrlToFilePath(url), filePath);
  assert.equal(localUrlToDataUrl(url), `data:image/png;base64,${source.toString('base64')}`);

  retainWorkflowRuntime(runId);
  assert.equal(resolveWorkflowRuntimeUrl(url), filePath);

  activateWorkflowRuntime('run:temporary-images:next', workflowId);
  assert.equal(resolveWorkflowRuntimeUrl(url), null);
  assert.equal(localUrlToFilePath(url), null);
  assert.equal(fs.existsSync(filePath), false);
  cleanupWorkflowRuntime('run:temporary-images:next');
});

test('workflow runtime resolver rejects inactive runs and path traversal', () => {
  const runId = 'run-security';
  activateWorkflowRuntime(runId, 'workflow-security');
  const url = writeWorkflowRuntimeAsset(runId, Buffer.from('safe'), 'image/png');

  assert.equal(resolveWorkflowRuntimeAsset('another-run', path.basename(url)), null);
  assert.equal(resolveWorkflowRuntimeAsset(runId, '../outside.png'), null);
  assert.equal(resolveWorkflowRuntimeAsset(runId, '%2e%2e/outside.png'), null);

  cleanupWorkflowRuntime(runId);
});

test('older concurrent runs cannot replace a newer retained runtime', () => {
  const workflowId = 'workflow-concurrent-runtime';
  const olderRunId = 'run-concurrent-older';
  const newerRunId = 'run-concurrent-newer';

  activateWorkflowRuntime(olderRunId, workflowId);
  const olderUrl = writeWorkflowRuntimeAsset(olderRunId, Buffer.from('older'), 'image/png');
  activateWorkflowRuntime(newerRunId, workflowId);
  const newerUrl = writeWorkflowRuntimeAsset(newerRunId, Buffer.from('newer'), 'image/png');

  retainWorkflowRuntime(newerRunId);
  retainWorkflowRuntime(olderRunId);

  assert.equal(resolveWorkflowRuntimeUrl(olderUrl), null);
  assert.equal(typeof resolveWorkflowRuntimeUrl(newerUrl), 'string');
  cleanupWorkflowRuntime(newerRunId);
});

test('startup initialization removes abandoned workflow runtime directories', () => {
  const abandoned = path.join(storageRoot, 'runtime', 'workflows', 'abandoned', 'part.png');
  fs.mkdirSync(path.dirname(abandoned), { recursive: true });
  fs.writeFileSync(abandoned, 'stale');

  // Re-import with a query so the startup guard represents a fresh process.
  return import(`../src/platform/storage/workflow-runtime-assets.ts?startup=${Date.now()}`).then((module) => {
    module.initializeWorkflowRuntimeStorage();
    assert.equal(fs.existsSync(abandoned), false);
  });
});
