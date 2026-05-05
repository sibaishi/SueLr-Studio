import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase4-runlog-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('workflow run logger writes stable run metadata and lifecycle events', async () => {
  const root = createStorageDir('run-logger');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { createWorkflowRunLogger } = await import(`../src/platform/logging/workflow-run-logger.js?test=${Date.now()}`);

  const logger = createWorkflowRunLogger({
    workflowId: 'wf_log_test',
    workflowVersion: 1,
    snapshotVersion: 1,
    source: 'draft',
    nodes: [{ id: 'node-1' }],
    edges: [],
  }, {
    requestId: 'req_test_1',
  });

  logger.log('workflow_node_started', { nodeId: 'node-1', index: 0, total: 1 });
  logger.close('completed', { successCount: 1, failCount: 0, totalDuration: 12 });

  const raw = fs.readFileSync(logger.filePath, 'utf8').trim();
  const entries = raw.split('\n').map((line) => JSON.parse(line));

  assert.equal(entries.length, 3);
  assert.equal(entries[0].event, 'workflow_run_started');
  assert.equal(entries[1].event, 'workflow_node_started');
  assert.equal(entries[2].event, 'workflow_run_completed');

  for (const entry of entries) {
    assert.equal(entry.runId, logger.runId);
    assert.equal(entry.workflowId, 'wf_log_test');
    assert.ok(typeof entry.processInstanceId === 'string' && entry.processInstanceId.length > 0);
    assert.equal(entry.requestId, 'req_test_1');
    assert.equal(entry.snapshotVersion, 1);
    assert.equal(entry.source, 'draft');
    assert.ok(typeof entry.timestamp === 'string' && entry.timestamp.length > 0);
  }

  assert.equal(entries[0].data.workflowVersion, 1);
  assert.equal(entries[0].data.nodeCount, 1);
  assert.equal(entries[2].data.status, 'completed');
  assert.equal(entries[2].data.successCount, 1);
});

test('workflow run logger can store auxiliary inline payload files', async () => {
  const root = createStorageDir('run-logger-artifact');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { createWorkflowRunLogger } = await import(`../src/platform/logging/workflow-run-logger.js?artifact=${Date.now()}`);

  const logger = createWorkflowRunLogger({
    workflowId: 'wf_artifact_test',
    workflowVersion: 1,
    snapshotVersion: 1,
    source: 'draft',
    nodes: [],
    edges: [],
  }, {
    requestId: 'req_artifact_1',
  });

  const artifactPath = logger.writeTextFile('inline-image', 'data:image/png;base64,AAAA', 'dataurl.txt');

  assert.equal(path.dirname(artifactPath), logger.directory);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.match(path.basename(artifactPath), /\.dataurl\.txt$/);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), 'data:image/png;base64,AAAA');
});
