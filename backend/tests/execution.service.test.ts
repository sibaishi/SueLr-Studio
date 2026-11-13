// @ts-nocheck

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { NODE_EXECUTORS } from '../src/engine/nodes/index.ts';
import { saveExecutionHistory } from '../src/modules/execution/execution-history.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { ExecutionService } from '../src/modules/execution/execution.service.ts';
import { STORAGE_PATHS } from '../src/platform/storage/index.ts';
import {
  cleanupWorkflowRuntime,
  resolveWorkflowRuntimeUrl,
  writeWorkflowRuntimeAsset,
} from '../src/platform/storage/workflow-runtime-assets.ts';
import { createStorageDir as createRuntimeStorageDir } from './helpers/runtime-test.ts';

const createStorageDir = (name) => createRuntimeStorageDir('execution-service', name);

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
  return chunks
    .flatMap((chunk) => String(chunk).trim().split('\n\n'))
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

  service.rememberRecentExecution(
    {
      status: 'completed',
      runId: 'run_recent_completed',
      workflowId: 'wf_1',
      source: 'draft',
      snapshotVersion: 7,
      finishedAt: 123,
      totalDuration: 456,
      successCount: 3,
      failCount: 1,
    },
    now,
  );

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

  service.rememberRecentExecution(
    {
      status: 'failed',
      runId: 'run_recent_failed',
      workflowId: 'wf_1',
      error: 'timeout',
    },
    now,
  );

  service.pruneRecentExecutions(now + 5 * 60 * 1000 + 1);

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
        type: 'io',
        position: { x: 0, y: 0 },
        data: { content: inlineImage },
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
  assert.deepEqual(logEvent.data, { runId: logEvent.data.runId });

  const workflowRunDays = fs.readdirSync(STORAGE_PATHS.workflowRunsDir);
  assert.equal(workflowRunDays.length > 0, true);
  const latestDayDir = path.join(STORAGE_PATHS.workflowRunsDir, workflowRunDays.sort().at(-1));
  const logFiles = fs.readdirSync(latestDayDir).filter((name) => name.endsWith('.jsonl'));
  assert.equal(logFiles.length > 0, true);
  const logPath = path.join(latestDayDir, logFiles.sort().at(-1));
  const rawLog = fs.readFileSync(logPath, 'utf8');
  assert.equal(rawLog.includes(inlineImage), false);

  const entries = rawLog
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const completedEntry = entries.find(
    (entry) => entry.event === 'workflow_node_completed' && entry.data.nodeId === 'text-1',
  );
  assert.ok(completedEntry);
  assert.equal(completedEntry.data.outputs.result.kind, 'inline-data-url');
  assert.equal(completedEntry.data.outputs.result.mimeType, 'image/png');
  assert.equal(completedEntry.data.outputs.result.encoding, 'base64');
  assert.equal(completedEntry.data.outputs.result.length, inlineImage.length);
  assert.match(completedEntry.data.outputs.result.preview, /^data:image\/png;base64,/);
  assert.match(completedEntry.data.outputs.result.artifact, /\.dataurl\.txt$/);

  const artifactPath = path.join(path.dirname(logPath), completedEntry.data.outputs.result.artifact);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), inlineImage);

  const sseCompletedEvent = sseEvents.find(
    ({ event, data }) => event === 'workflow_node_completed' && data.nodeId === 'text-1',
  );
  assert.equal(sseCompletedEvent.data.outputs.result, inlineImage);

  const afterRestart = new ExecutionService();
  const [record] = afterRestart.listHistory(workflow.id);
  assert.equal(record.runId, logEvent.data.runId);
  assert.equal(record.status, 'completed');
  assert.equal(record.nodeCount, 1);
  assert.equal(afterRestart.getStatus(record.runId).status, 'completed');
  assert.doesNotMatch(JSON.stringify(record), /data:image/);
});


test('ExecutionService recovers an existing video after restart and publishes only the saved file', async (t) => {
  const root = createStorageDir('video-recovery');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const baseUrl = 'https://93.184.216.34/v1';
  const workflowId = 'wf_video_recovery';
  const runId = `2026-11-12T10-00-00-000Z_${workflowId}`;
  saveExecutionHistory({
    runId, workflowId, source: 'draft', snapshotVersion: 1, status: 'failed', startedAt: 1,
    nodeCount: 1, failures: [], outputs: [],
    videoRecoveries: [{
      id: 'recovery', nodeId: 'video', taskId: 'private-task', baseUrl, configId: 'original',
      endpoint: '/v1/video/generations', model: 'original::seedance',
    }],
  });

  t.mock.method(settingsService, 'buildRuntimeConfig', () => ({
    configId: 'original',
    configs: [{ id: 'original', baseUrl, apiKey: 'fixture-key' }],
  }));
  const calls = [];
  const video = Buffer.from('0000ftypisom');
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    assert.notEqual(options.method, 'POST');
    calls.push(String(url));
    return String(url).endsWith('/private-task')
      ? Response.json({ status: 'SUCCESS', video_url: `${baseUrl}/result.mp4` })
      : new Response(video, { headers: { 'content-type': 'video/mp4' } });
  });
  const service = new ExecutionService();
  assert.doesNotMatch(JSON.stringify(service.listHistory(workflowId)), /private-task|fixture-key/);
  const { output } = await service.recoverVideo(runId, 'recovery');
  assert.match(output, /^\/api\/outputs\/videos\//);
  assert.deepEqual(fs.readFileSync(path.join(STORAGE_PATHS.generatedDir, output.replace('/api/outputs/', ''))), video);
  assert.deepEqual(calls, [`${baseUrl}/video/generations/private-task`, `${baseUrl}/result.mp4`]);

  const [record] = new ExecutionService().listHistory(workflowId);
  assert.deepEqual(record.outputs, [output]);
  assert.deepEqual(record.recoverableVideos, []);
  await assert.rejects(service.recoverVideo(runId, 'recovery'), { code: 'VIDEO_RECOVERY_NOT_FOUND' });
});
