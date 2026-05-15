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

test('ExecutionService.executeForAgent resolves saved workflows by name and returns key outputs', async () => {
  const workflow = {
    id: 'wf_agent_summary',
    name: 'Agent Summary Workflow',
    version: 1,
    nodes: [
      {
        id: 'text-1',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { text: 'workflow output text' },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 100, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'text-1',
        sourceHandle: 'text',
        target: 'output-1',
        targetHandle: 'content',
      },
    ],
    settings: {},
  };
  const service = new ExecutionService({
    read(id) {
      assert.equal(id, 'wf_agent_summary');
      return { workflow };
    },
    list() {
      return [workflow];
    },
  });

  const result = await service.executeForAgent({
    workflowName: 'Agent Summary Workflow',
    apiConfig: {},
  });

  assert.equal(result.workflowId, 'wf_agent_summary');
  assert.equal(result.workflowName, 'Agent Summary Workflow');
  assert.equal(result.status, 'completed');
  assert.equal(typeof result.runId, 'string');
  assert.equal(Array.isArray(result.keyOutputs), true);
  assert.equal(result.keyOutputs.length > 0, true);
  assert.match(result.summary, /Agent Summary Workflow/);
  assert.match(result.summary, /runId:/);
});

test('ExecutionService.executeForAgent applies input overrides as a draft run and emits run metadata', async () => {
  const workflow = {
    id: 'wf_agent_inputs',
    name: 'Agent Input Workflow',
    version: 1,
    nodes: [
      {
        id: 'node_prompt',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { text: 'original prompt' },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 100, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node_prompt',
        sourceHandle: 'text',
        target: 'output-1',
        targetHandle: 'content',
      },
    ],
    settings: {},
  };
  const service = new ExecutionService({
    read(id) {
      assert.equal(id, 'wf_agent_inputs');
      return { workflow };
    },
    list() {
      return [workflow];
    },
  });

  let runStarted = null;
  const result = await service.executeForAgent({
    workflowId: 'wf_agent_inputs',
    inputs: {
      node_prompt: 'updated by agent',
    },
    apiConfig: {},
    onRunStarted(payload) {
      runStarted = payload;
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.source, 'draft');
  assert.deepEqual(result.appliedInputs, [
    {
      nodeId: 'node_prompt',
      nodeType: 'textInput',
      field: 'text',
      matchedBy: 'node_prompt',
    },
  ]);
  assert.match(result.summary, /appliedInputs: node_prompt/);
  assert.equal(runStarted?.workflowId, 'wf_agent_inputs');
  assert.equal(runStarted?.source, 'draft');
  assert.equal(Array.isArray(runStarted?.appliedInputs), true);
  assert.equal(runStarted?.appliedInputs?.[0]?.nodeId, 'node_prompt');
});

test('ExecutionService.executeForAgent matches human-friendly input aliases like 文本输入1', async () => {
  const workflow = {
    id: 'wf_agent_alias',
    name: 'Agent Alias Workflow',
    version: 1,
    nodes: [
      {
        id: 'first_prompt',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { text: 'original first' },
      },
      {
        id: 'second_prompt',
        type: 'textInput',
        position: { x: 0, y: 80 },
        data: { text: 'original second' },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 100, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'first_prompt',
        sourceHandle: 'text',
        target: 'output-1',
        targetHandle: 'content',
      },
    ],
    settings: {},
  };
  const service = new ExecutionService({
    read() {
      return { workflow };
    },
    list() {
      return [workflow];
    },
  });

  const result = await service.executeForAgent({
    workflowId: 'wf_agent_alias',
    inputs: {
      文本输入1: '兄弟你好香啊',
    },
    apiConfig: {},
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.source, 'draft');
  assert.equal(result.appliedInputs[0]?.nodeId, 'first_prompt');
  assert.equal(result.appliedInputs[0]?.matchedBy, '文本输入1');
  assert.match(result.summary, /appliedInputs: first_prompt/);
});

test('ExecutionService.executeForAgent throws when no requested input keys match any input node', async () => {
  const workflow = {
    id: 'wf_agent_unmatched',
    name: 'Agent Unmatched Workflow',
    version: 1,
    nodes: [
      {
        id: 'question',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { text: 'original' },
      },
    ],
    edges: [],
    settings: {},
  };
  const service = new ExecutionService({
    read() {
      return { workflow };
    },
    list() {
      return [workflow];
    },
  });

  await assert.rejects(
    () => service.executeForAgent({
      workflowId: 'wf_agent_unmatched',
      inputs: {
        不存在的节点: 'new value',
      },
      apiConfig: {},
    }),
    /did not match any input nodes/,
  );
});
