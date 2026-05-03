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
  process.env.APP_STORAGE_DIR = createStorageDir('run-logger');

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
