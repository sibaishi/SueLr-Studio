import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../engine/executor.js';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.js';
import { createWorkflowRunLogger } from '../src/platform/logging/workflow-run-logger.js';
import { sanitizeNodeOutputsForLogs } from '../src/platform/logging/workflow-log-sanitizer.js';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `executor-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('disabled nodes are excluded from workflow execution and validation', async () => {
  const events = [];

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'enabled-text',
          type: 'textInput',
          data: { text: 'hello' },
        },
        {
          id: 'disabled-image-gen',
          type: 'imageGen',
          data: { disabled: true },
        },
      ],
      edges: [
        {
          id: 'edge-disabled',
          source: 'enabled-text',
          sourceHandle: 'text',
          target: 'disabled-image-gen',
          targetHandle: 'prompt',
        },
      ],
    },
    {},
    (event, data) => events.push({ event, data }),
  );

  assert.equal(events.some(({ event }) => event === WORKFLOW_SSE_EVENTS.VALIDATION_FAILED), false);

  const nodeEvents = events.filter(({ event }) => (
    event === WORKFLOW_SSE_EVENTS.NODE_STARTED
    || event === WORKFLOW_SSE_EVENTS.NODE_PROGRESS
    || event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
    || event === WORKFLOW_SSE_EVENTS.NODE_FAILED
  ));

  assert.deepEqual(nodeEvents.map(({ data }) => data.nodeId), ['enabled-text', 'enabled-text']);
  assert.deepEqual(events.at(-1), {
    event: WORKFLOW_SSE_EVENTS.RUN_COMPLETED,
    data: {
      totalDuration: events.at(-1).data.totalDuration,
      successCount: 1,
      failCount: 0,
    },
  });
});

test('workflow node completed events include sanitized log outputs while preserving raw outputs', async () => {
  process.env.APP_STORAGE_DIR = createStorageDir('inline-data');

  const inlineImage = `data:image/png;base64,${'A'.repeat(1024)}`;
  const events = [];
  const runLogger = createWorkflowRunLogger({
    workflowId: 'wf_inline_data',
    workflowVersion: 1,
    snapshotVersion: 1,
    source: 'draft',
    nodes: [{ id: 'text-1' }, { id: 'output-1' }],
    edges: [{ id: 'edge-1' }],
  }, {
    requestId: 'req_inline_data',
  });

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'text-1',
          type: 'textInput',
          data: { text: inlineImage },
        },
        {
          id: 'output-1',
          type: 'output',
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
    },
    {},
    (event, data) => events.push({ event, data }),
    {
      getNodeLogOutputs(outputs) {
        return sanitizeNodeOutputsForLogs(outputs, runLogger);
      },
    },
  );

  const completedEvent = events.find(({ event, data }) => (
    event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
    && data.nodeId === 'text-1'
  ));

  assert.ok(completedEvent);
  assert.equal(completedEvent.data.outputs.text, inlineImage);
  assert.equal(completedEvent.data.logOutputs.text.kind, 'inline-data-url');
  assert.equal(completedEvent.data.logOutputs.text.mimeType, 'image/png');
  assert.equal(completedEvent.data.logOutputs.text.storage, 'text/data-url');
  assert.ok(completedEvent.data.logOutputs.text.length > 1024);
  assert.match(completedEvent.data.logOutputs.text.preview, /^data:image\/png;base64,/);
  assert.match(completedEvent.data.logOutputs.text.artifact, /\.dataurl\.txt$/);

  const artifactPath = path.join(runLogger.directory, completedEvent.data.logOutputs.text.artifact);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), inlineImage);
});
