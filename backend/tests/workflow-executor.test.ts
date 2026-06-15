// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../src/engine/executor.ts';
import { NODE_EXECUTORS } from '../src/engine/nodes/index.ts';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.ts';
import { createWorkflowRunLogger } from '../src/platform/logging/workflow-run-logger.ts';
import { sanitizeNodeOutputsForLogs } from '../src/platform/logging/workflow-log-sanitizer.ts';
import { ensureScopedStorageDirectories } from '../src/platform/storage/scoped-storage.ts';
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
          type: 'io',
          data: { content: 'hello' },
        },
        {
          id: 'disabled-image-gen',
          type: 'aiV3',
          data: { mode: 'image', disabled: true },
        },
      ],
      edges: [
        {
          id: 'edge-disabled',
          source: 'enabled-text',
          sourceHandle: 'result',
          target: 'disabled-image-gen',
          targetHandle: 'input',
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

test('io uses upstream content when connected', async () => {
  const events = [];

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'source-text',
          type: 'io',
          data: { content: 'from upstream' },
        },
        {
          id: 'editable-text',
          type: 'io',
          data: { content: 'local fallback' },
        },
      ],
      edges: [
        {
          id: 'edge-text-input',
          source: 'source-text',
          sourceHandle: 'result',
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
  assert.deepEqual(completedEvent.data.outputs, { result: 'from upstream' });
});

test('io override flows to downstream io nodes', async () => {
  const events = [];

  await executeWorkflow(
    {
      nodes: [
        {
          id: 'source-text',
          type: 'io',
          data: { content: 'from upstream' },
        },
        {
          id: 'editable-text',
          type: 'io',
          data: { content: 'local fallback' },
        },
        {
          id: 'output',
          type: 'io',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge-text-input',
          source: 'source-text',
          sourceHandle: 'result',
          target: 'editable-text',
          targetHandle: 'input',
        },
        {
          id: 'edge-output',
          source: 'editable-text',
          sourceHandle: 'result',
          target: 'output',
          targetHandle: 'input',
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
  assert.equal(outputEvent.data.outputs.result, 'from upstream');
});

test('aiV3 image output flows into io and materializes generated files', async () => {
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
            type: 'io',
            data: { content: 'draw a mountain' },
          },
          {
            id: 'image',
            type: 'aiV3',
            data: { model: 'demo-image-model', mode: 'image', n: 1 },
          },
          {
            id: 'output',
            type: 'io',
            data: {},
          },
        ],
        edges: [
          {
            id: 'prompt-image',
            source: 'prompt',
            sourceHandle: 'result',
            target: 'image',
            targetHandle: 'input',
          },
          {
            id: 'image-output',
            source: 'image',
            sourceHandle: 'result',
            target: 'output',
            targetHandle: 'input',
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
    assert.equal(typeof outputEvent.data.outputs.result, 'string');
    assert.match(outputEvent.data.outputs.result, /^\/api\/outputs\/images\/.+\.png$/);
    assert.equal(Array.isArray(outputEvent.data.outputs.savedFiles), true);
    assert.equal(outputEvent.data.outputs.savedFiles.length > 0, true);
    assert.equal(typeof outputEvent.data.outputs.savedFiles[0].thumbnailUrl, 'string');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aiV3 resolves image inputs from request-scoped upload storage', async () => {
  const previousConfigDir = process.env.APP_CONFIG_DIR;
  const storageRoot = createStorageDir('aichat-scoped-image');
  process.env.APP_CONFIG_DIR = storageRoot;
  const scope = { userId: 'user_a', workspaceId: 'default', runtimeMode: 'local-web' };
  const scopedPaths = ensureScopedStorageDirectories(scope);
  fs.writeFileSync(path.join(scopedPaths.uploadsDir, 'source.png'), Buffer.from('ABC'));

  const originalFetch = global.fetch;
  let requestBody = null;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(String(options.body || '{}'));
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
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
          { id: 'prompt', type: 'io', data: { content: 'describe image' } },
          { id: 'image', type: 'io', data: { content: '/api/files/source.png' } },
          {
            id: 'chat',
            type: 'aiV3',
            data: { model: 'vision-model', systemPrompt: 'system' },
          },
        ],
        edges: [
          { source: 'prompt', sourceHandle: 'result', target: 'chat', targetHandle: 'input' },
          { source: 'image', sourceHandle: 'result', target: 'chat', targetHandle: 'input' },
        ],
      },
      {
        apiKey: 'sk-test',
        baseUrl: 'http://127.0.0.1:3001/v1',
        projectModels: [
          {
            modelId: 'vision-model',
            type: 'chat',
            enabled: true,
            endpointMode: 'category',
            endpointCategory: 'chat',
          },
        ],
        scope,
      },
      (event, data) => events.push({ event, data }),
    );

    assert.equal(events.some(({ event }) => event === WORKFLOW_SSE_EVENTS.NODE_FAILED), false);
    const imagePart = requestBody.messages[0].content.find((part) => part?.type === 'image_url');
    assert.equal(imagePart.image_url.url, 'data:image/png;base64,QUJD');
  } finally {
    global.fetch = originalFetch;
    if (previousConfigDir === undefined) {
      delete process.env.APP_CONFIG_DIR;
    } else {
      process.env.APP_CONFIG_DIR = previousConfigDir;
    }
    fs.rmSync(storageRoot, { recursive: true, force: true });
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
          { id: 'source-a', type: 'io', data: { content: 'alpha' } },
          { id: 'source-b', type: 'io', data: { content: 'beta' } },
          { id: 'clean-a', type: 'textClean', data: {} },
          { id: 'clean-b', type: 'textClean', data: {} },
          { id: 'merge', type: 'io', data: {} },
        ],
        edges: [
          { id: 'source-a-clean-a', source: 'source-a', sourceHandle: 'result', target: 'clean-a', targetHandle: 'text' },
          { id: 'source-b-clean-b', source: 'source-b', sourceHandle: 'result', target: 'clean-b', targetHandle: 'text' },
          { id: 'clean-a-merge', source: 'clean-a', sourceHandle: 'text', target: 'merge', targetHandle: 'input' },
          { id: 'clean-b-merge', source: 'clean-b', sourceHandle: 'text', target: 'merge', targetHandle: 'input' },
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

test('aiV3 image mode runs multi-image requests concurrently through workflow config', async () => {
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
          { id: 'prompt', type: 'io', data: { content: 'draw a mountain' } },
          { id: 'image', type: 'aiV3', data: { model: 'demo-image-model', mode: 'image', n: 4 } },
        ],
        edges: [
          { id: 'prompt-image', source: 'prompt', sourceHandle: 'result', target: 'image', targetHandle: 'input' },
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
    assert.equal(imageCompleted?.data.outputs.result.length, 4);
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
          type: 'io',
          data: { content: inlineImage },
        },
        {
          id: 'output-1',
          type: 'io',
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'text-1',
          sourceHandle: 'result',
          target: 'output-1',
          targetHandle: 'input',
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
  assert.equal(completedEvent.data.outputs.result, inlineImage);
  assert.equal(completedEvent.data.logOutputs.result.kind, 'inline-data-url');
  assert.equal(completedEvent.data.logOutputs.result.mimeType, 'image/png');
  assert.equal(completedEvent.data.logOutputs.result.storage, 'text/data-url');
  assert.ok(completedEvent.data.logOutputs.result.length > 1024);
  assert.match(completedEvent.data.logOutputs.result.preview, /^data:image\/png;base64,/);
  assert.match(completedEvent.data.logOutputs.result.artifact, /\.dataurl\.txt$/);

  const artifactPath = path.join(runLogger.directory, completedEvent.data.logOutputs.result.artifact);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), inlineImage);
});
