import test from 'node:test';
import assert from 'node:assert/strict';

import { ExecutionService } from '../src/modules/execution/execution.service.js';

test('ExecutionService exposes a recently completed run status after the active run is removed', () => {
  const service = new ExecutionService({
    read() {
      return { workflow: { id: 'wf_1' } };
    },
  });
  const now = Date.now();

  service.rememberRecentExecution({
    status: 'completed',
    runId: 'run_recent_completed',
    workflowId: 'wf_1',
    source: 'draft',
    snapshotVersion: 7,
    finishedAt: 123,
    totalDuration: 456,
    successCount: 3,
    failCount: 1,
  }, now);

  assert.deepEqual(service.getStatus('run_recent_completed'), {
    status: 'completed',
    runId: 'run_recent_completed',
    workflowId: 'wf_1',
    source: 'draft',
    snapshotVersion: 7,
    finishedAt: 123,
    totalDuration: 456,
    successCount: 3,
    failCount: 1,
  });
});

test('ExecutionService recent run status expires after retention window', () => {
  const service = new ExecutionService({
    read() {
      return { workflow: { id: 'wf_1' } };
    },
  });
  const now = Date.now();

  service.rememberRecentExecution({
    status: 'failed',
    runId: 'run_recent_failed',
    workflowId: 'wf_1',
    error: 'timeout',
  }, now);

  service.pruneRecentExecutions(now + (5 * 60 * 1000) + 1);

  assert.deepEqual(service.getStatus('run_recent_failed'), {
    status: 'idle',
    runId: 'run_recent_failed',
  });
});
