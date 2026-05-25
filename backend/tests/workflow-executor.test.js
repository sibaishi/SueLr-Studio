import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../src/engine/executor.js';
import { NODE_EXECUTORS } from '../src/engine/nodes/index.js';
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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

test('textInput uses upstream text when connected', async () => {
  const events = [];

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'source-text',
          type: 'textInput',
          data: { text: 'from upstream' },
        },
        {
          id: 'editable-text',
          type: 'textInput',
          data: { text: 'local fallback' },
        },
      ],
      edges: [
        {
          id: 'edge-text-input',
          source: 'source-text',
          sourceHandle: 'text',
          target: 'editable-text',
          targetHandle: 'input',
        },
      ],
    },
    {},
    (event, data) => events.push({ event, data }),
  );

  const completedEvent = events.find(({ event, data }) => (
    event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
    && data.nodeId === 'editable-text'
  ));

  assert.ok(completedEvent);
  assert.deepEqual(completedEvent.data.outputs, { text: 'from upstream' });
});

test('textInput override flows to downstream output nodes', async () => {
  const events = [];

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'source-text',
          type: 'textInput',
          data: { text: 'from upstream' },
        },
        {
          id: 'editable-text',
          type: 'textInput',
          data: { text: 'local fallback' },
        },
        {
          id: 'output',
          type: 'output',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge-text-input',
          source: 'source-text',
          sourceHandle: 'text',
          target: 'editable-text',
          targetHandle: 'input',
        },
        {
          id: 'edge-output',
          source: 'editable-text',
          sourceHandle: 'text',
          target: 'output',
          targetHandle: 'content',
        },
      ],
    },
    {},
    (event, data) => events.push({ event, data }),
  );

  const outputEvent = events.find(({ event, data }) => (
    event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
    && data.nodeId === 'output'
  ));

  assert.ok(outputEvent);
  assert.equal(outputEvent.data.outputs.content, 'from upstream');
});

test('legacy image handle aliases still flow imageGen output into output nodes', async () => {
  const originalFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      { b64_json: 'YWJj' },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    await executeWorkflow(
      {
        nodes: [
          {
            id: 'prompt',
            type: 'textInput',
            data: { text: 'draw a mountain' },
          },
          {
            id: 'image',
            type: 'imageGen',
            data: { model: 'demo-image-model', n: 1 },
          },
          {
            id: 'output',
            type: 'output',
            data: {},
          },
        ],
        edges: [
          {
            id: 'prompt-image',
            source: 'prompt',
            sourceHandle: 'text',
            target: 'image',
            targetHandle: 'prompt',
          },
          {
            id: 'image-output',
            source: 'image',
            sourceHandle: 'image',
            target: 'output',
            targetHandle: 'content',
          },
        ],
      },
      {
        apiKey: 'demo-key',
        baseUrl: 'https://example.com',
        providerConfig: {
          authType: 'bearer',
          imageEndpoint: '/v1/images/generations',
          imageEditEndpoint: '/v1/images/edits',
        },
        projectModels: [
          {
            id: 'demo-image-model',
            modelId: 'demo-image-model',
            type: 'image',
            enabled: true,
            endpointMode: 'category',
            endpointCategory: 'image',
          },
        ],
      },
      (event, data) => events.push({ event, data }),
    );

    const outputEvent = events.find(({ event, data }) => (
      event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && data.nodeId === 'output'
    ));

    assert.ok(outputEvent);
    assert.equal(typeof outputEvent.data.outputs.content, 'string');
    assert.match(outputEvent.data.outputs.content, /^\/api\/outputs\/images\/.+\.png$/);
    assert.equal(Array.isArray(outputEvent.data.outputs.savedFiles), true);
    assert.equal(outputEvent.data.outputs.savedFiles.length > 0, true);
    assert.equal(typeof outputEvent.data.outputs.savedFiles[0].thumbnailUrl, 'string');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('independent ready workflow nodes execute concurrently when enabled', async () => {
  const originalTextClean = NODE_EXECUTORS.textClean;
  const bothCleanNodesStarted = createDeferred();
  const releaseCleanNodes = createDeferred();
  const cleanStarted = [];
  const events = [];

  NODE_EXECUTORS.textClean = async (_node, inputs) => {
    cleanStarted.push(_node.id);
    if (cleanStarted.length === 2) {
      bothCleanNodesStarted.resolve();
    }
    await releaseCleanNodes.promise;
    return { text: inputs.text };
  };

  try {
    const runPromise = executeWorkflow(
      {
        nodes: [
          { id: 'source-a', type: 'textInput', data: { text: 'alpha' } },
          { id: 'source-b', type: 'textInput', data: { text: 'beta' } },
          { id: 'clean-a', type: 'textClean', data: {} },
          { id: 'clean-b', type: 'textClean', data: {} },
          { id: 'merge', type: 'textMerge', data: { inputCount: 2 } },
        ],
        edges: [
          { id: 'source-a-clean-a', source: 'source-a', sourceHandle: 'text', target: 'clean-a', targetHandle: 'text' },
          { id: 'source-b-clean-b', source: 'source-b', sourceHandle: 'text', target: 'clean-b', targetHandle: 'text' },
          { id: 'clean-a-merge', source: 'clean-a', sourceHandle: 'text', target: 'merge', targetHandle: 'item1' },
          { id: 'clean-b-merge', source: 'clean-b', sourceHandle: 'text', target: 'merge', targetHandle: 'item2' },
        ],
      },
      { workflowExecution: { enabled: true, maxConcurrency: 16 } },
      (event, data) => events.push({ event, data }),
    );

    await bothCleanNodesStarted.promise;
    const cleanCompletionsBeforeRelease = events.filter((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && ['clean-a', 'clean-b'].includes(item.data.nodeId)
    ));
    assert.deepEqual(cleanStarted.sort(), ['clean-a', 'clean-b']);
    assert.equal(cleanCompletionsBeforeRelease.length, 0);

    releaseCleanNodes.resolve();
    await runPromise;

    const mergeStartedIndex = events.findIndex((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_STARTED
      && item.data.nodeId === 'merge'
    ));
    const cleanCompletionIndexes = events
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (
        item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
        && ['clean-a', 'clean-b'].includes(item.data.nodeId)
      ))
      .map(({ index }) => index);

    assert.equal(cleanCompletionIndexes.length, 2);
    assert.ok(cleanCompletionIndexes.every((index) => index < mergeStartedIndex));
  } finally {
    NODE_EXECUTORS.textClean = originalTextClean;
  }
});

test('imageGen node runs multi-image requests concurrently through workflow config', async () => {
  const originalFetch = globalThis.fetch;
  const allRequestsStarted = createDeferred();
  let startedRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  globalThis.fetch = async () => {
    startedRequests += 1;
    const requestIndex = startedRequests;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    if (startedRequests === 4) {
      allRequestsStarted.resolve();
    }

    await allRequestsStarted.promise;
    activeRequests -= 1;

    return new Response(JSON.stringify({
      data: [
        { b64_json: Buffer.from(`workflow-image-${requestIndex}`).toString('base64') },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const events = [];
    await executeWorkflow(
      {
        nodes: [
          { id: 'prompt', type: 'textInput', data: { text: 'draw a mountain' } },
          { id: 'image', type: 'imageGen', data: { model: 'demo-image-model', n: 4 } },
        ],
        edges: [
          { id: 'prompt-image', source: 'prompt', sourceHandle: 'text', target: 'image', targetHandle: 'prompt' },
        ],
      },
      {
        apiKey: 'demo-key',
        baseUrl: 'https://example.com',
        providerConfig: {
          authType: 'bearer',
          imageEndpoint: '/v1/images/generations',
          imageEditEndpoint: '/v1/images/edits',
        },
        projectModels: [
          {
            id: 'demo-image-model',
            modelId: 'demo-image-model',
            type: 'image',
            enabled: true,
            endpointMode: 'category',
            endpointCategory: 'image',
          },
        ],
        workflowExecution: { enabled: true, maxConcurrency: 4 },
      },
      (event, data) => events.push({ event, data }),
    );

    const imageCompleted = events.find((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && item.data.nodeId === 'image'
    ));

    assert.equal(startedRequests, 4);
    assert.equal(maxActiveRequests, 4);
    assert.equal(imageCompleted?.data.outputs.images.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('workflow node completed events include sanitized log outputs while preserving raw outputs', async () => {
  const root = createStorageDir('inline-data');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

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
