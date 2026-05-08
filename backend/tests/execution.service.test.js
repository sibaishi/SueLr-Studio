import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { ExecutionService } from '../src/modules/execution/execution.service.js';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `execution-service-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function createMockSseResponse() {
  const chunks = [];
  return {
    writableEnded: false,
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

function parseSseEvents(chunks) {
  return chunks.flatMap((chunk) => String(chunk).trim().split('\n\n'))
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
      return { event, data: data ? JSON.parse(data) : null };
    });
}

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

test('ExecutionService returns idle for unknown run ids when neither active nor recent state exists', () => {
  const service = new ExecutionService({
    read() {
      return { workflow: { id: 'wf_1' } };
    },
  });

  assert.deepEqual(service.getStatus('run_missing'), {
    status: 'idle',
    runId: 'run_missing',
  });
});

test('ExecutionService stores sanitized node outputs in workflow run logs', async () => {
  const root = createStorageDir('sanitized-run-log');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const inlineImage = `data:image/png;base64,${'A'.repeat(1024)}`;
  const workflow = {
    id: 'wf_inline_log',
    name: 'inline log workflow',
    version: 1,
    nodes: [
      {
        id: 'text-1',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { text: inlineImage },
      },
    ],
    edges: [],
  };
  const service = new ExecutionService({
    read() {
      return { workflow };
    },
  });
  const res = createMockSseResponse();

  await service.execute('wf_inline_log', {}, res, 'req_inline_log');

  const sseEvents = parseSseEvents(res.chunks);
  const logEvent = sseEvents.find(({ event }) => event === 'workflow_log');
  assert.ok(logEvent);

  const rawLog = fs.readFileSync(logEvent.data.path, 'utf8');
  assert.equal(rawLog.includes(inlineImage), false);

  const entries = rawLog.trim().split('\n').map((line) => JSON.parse(line));
  const completedEntry = entries.find((entry) => (
    entry.event === 'workflow_node_completed'
    && entry.data.nodeId === 'text-1'
  ));
  assert.ok(completedEntry);
  assert.equal(completedEntry.data.outputs.text.kind, 'inline-data-url');
  assert.equal(completedEntry.data.outputs.text.mimeType, 'image/png');
  assert.equal(completedEntry.data.outputs.text.encoding, 'base64');
  assert.equal(completedEntry.data.outputs.text.length, inlineImage.length);
  assert.match(completedEntry.data.outputs.text.preview, /^data:image\/png;base64,/);
  assert.match(completedEntry.data.outputs.text.artifact, /\.dataurl\.txt$/);

  const artifactPath = path.join(path.dirname(logEvent.data.path), completedEntry.data.outputs.text.artifact);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), inlineImage);

  const sseCompletedEvent = sseEvents.find(({ event, data }) => (
    event === 'workflow_node_completed'
    && data.nodeId === 'text-1'
  ));
  assert.equal(sseCompletedEvent.data.outputs.text, inlineImage);
});
