// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../src/engine/executor.ts';
import { NODE_EXECUTORS } from '../src/engine/nodes/index.ts';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.ts';

function edge(id, source, sourceHandle, target, targetHandle) {
  return { id, source, sourceHandle, target, targetHandle };
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

async function runWorkflow(workflow) {
  const events = [];
  await executeWorkflow(workflow, {}, (event, data) => {
    events.push({ event, data });
  });
  return events;
}

test('iterateRun executes downstream once per connected text input', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
      { id: 'iterate', type: 'iterateRun', data: { inputCount: 3 } },
      { id: 'clean', type: 'textClean', data: {} },
    ],
    edges: [
      edge('a-iterate', 'promptA', 'text', 'iterate', 'item1'),
      edge('b-iterate', 'promptB', 'text', 'iterate', 'item2'),
      edge('iterate-clean', 'iterate', 'text', 'clean', 'text'),
    ],
  });

  const cleanCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'clean',
  );

  assert.equal(cleanCompletions.length, 2);
  assert.deepEqual(cleanCompletions.map((item) => item.data.outputs), [
    { text: 'alpha' },
    { text: 'beta' },
  ]);
  assert.deepEqual(cleanCompletions.map((item) => item.data.iteration.index), [1, 2]);

  const completed = events.find((item) => item.event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED);
  assert.equal(completed.data.failCount, 0);
});

test('iterateRun skips empty text inputs', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: '' } },
      { id: 'iterate', type: 'iterateRun', data: { inputCount: 3 } },
      { id: 'clean', type: 'textClean', data: {} },
    ],
    edges: [
      edge('a-iterate', 'promptA', 'text', 'iterate', 'item1'),
      edge('b-iterate', 'promptB', 'text', 'iterate', 'item2'),
      edge('iterate-clean', 'iterate', 'text', 'clean', 'text'),
    ],
  });

  const cleanCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'clean',
  );

  assert.equal(cleanCompletions.length, 1);
  assert.deepEqual(cleanCompletions[0].data.outputs, { text: 'alpha' });
});

test('iterateRun supports multiple independent control nodes', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
      { id: 'promptC', type: 'textInput', data: { text: 'gamma' } },
      { id: 'promptD', type: 'textInput', data: { text: 'delta' } },
      { id: 'iterateA', type: 'iterateRun', data: { inputCount: 2 } },
      { id: 'iterateB', type: 'iterateRun', data: { inputCount: 2 } },
      { id: 'cleanA', type: 'textClean', data: {} },
      { id: 'cleanB', type: 'textClean', data: {} },
    ],
    edges: [
      edge('a-iterate-a', 'promptA', 'text', 'iterateA', 'item1'),
      edge('b-iterate-a', 'promptB', 'text', 'iterateA', 'item2'),
      edge('iterate-a-clean-a', 'iterateA', 'text', 'cleanA', 'text'),
      edge('c-iterate-b', 'promptC', 'text', 'iterateB', 'item1'),
      edge('d-iterate-b', 'promptD', 'text', 'iterateB', 'item2'),
      edge('iterate-b-clean-b', 'iterateB', 'text', 'cleanB', 'text'),
    ],
  });

  const cleanACompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'cleanA',
  );
  const cleanBCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'cleanB',
  );

  assert.deepEqual(cleanACompletions.map((item) => item.data.outputs), [
    { text: 'alpha' },
    { text: 'beta' },
  ]);
  assert.deepEqual(cleanBCompletions.map((item) => item.data.outputs), [
    { text: 'gamma' },
    { text: 'delta' },
  ]);

  const completed = events.find((item) => item.event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED);
  assert.equal(completed.data.failCount, 0);
});

test('iterateRun supports nested control nodes', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
      { id: 'outer', type: 'iterateRun', data: { inputCount: 2 } },
      { id: 'inner', type: 'iterateRun', data: { inputCount: 1 } },
      { id: 'clean', type: 'textClean', data: {} },
    ],
    edges: [
      edge('a-outer', 'promptA', 'text', 'outer', 'item1'),
      edge('b-outer', 'promptB', 'text', 'outer', 'item2'),
      edge('outer-inner', 'outer', 'text', 'inner', 'item1'),
      edge('inner-clean', 'inner', 'text', 'clean', 'text'),
    ],
  });

  const cleanCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'clean',
  );

  assert.deepEqual(cleanCompletions.map((item) => item.data.outputs), [
    { text: 'alpha' },
    { text: 'beta' },
  ]);
  assert.deepEqual(cleanCompletions.map((item) => item.data.iteration.parent.index), [1, 2]);

  const completed = events.find((item) => item.event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED);
  assert.equal(completed.data.failCount, 0);
});

test('iterateImageRun executes downstream once per connected image input', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'imageA', type: 'imageInput', data: { fileUrl: '/api/files/a.png' } },
      { id: 'imageB', type: 'imageInput', data: { fileUrl: '/api/files/b.png' } },
      { id: 'iterateImage', type: 'iterateImageRun', data: { inputCount: 3 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('a-iterate-image', 'imageA', 'image', 'iterateImage', 'item1'),
      edge('b-iterate-image', 'imageB', 'image', 'iterateImage', 'item2'),
      edge('iterate-image-output', 'iterateImage', 'image', 'output', 'content'),
    ],
  });

  const outputCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );

  assert.equal(outputCompletions.length, 2);
  assert.deepEqual(outputCompletions.map((item) => item.data.outputs.content), [
    '/api/files/a.png',
    '/api/files/b.png',
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.iteration.index), [1, 2]);

  const completed = events.find((item) => item.event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED);
  assert.equal(completed.data.failCount, 0);
});

test('iterateImageRun expands image array inputs into sequential item runs', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'imageA', type: 'imageInput', data: { fileUrl: '/api/files/a.png' } },
      { id: 'imageB', type: 'imageInput', data: { fileUrl: '/api/files/b.png' } },
      { id: 'merge', type: 'imageMerge', data: { inputCount: 2 } },
      { id: 'iterateImage', type: 'iterateImageRun', data: { inputCount: 2 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('a-merge', 'imageA', 'image', 'merge', 'item1'),
      edge('b-merge', 'imageB', 'image', 'merge', 'item2'),
      edge('merged-to-iterate-image', 'merge', 'merged', 'iterateImage', 'item1'),
      edge('iterate-image-output', 'iterateImage', 'image', 'output', 'content'),
    ],
  });

  const outputCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );
  assert.equal(outputCompletions.length, 2);
  assert.deepEqual(outputCompletions.map((item) => item.data.outputs.content), [
    '/api/files/a.png',
    '/api/files/b.png',
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.iteration.index), [1, 2]);
});

test('iterateRun executes item downstream segments concurrently', async () => {
  const originalTextClean = NODE_EXECUTORS.textClean;
  const bothItemsStarted = createDeferred();
  const releaseItems = createDeferred();
  const startedIterations = [];
  const events = [];

  NODE_EXECUTORS.textClean = async (_node, inputs) => {
    startedIterations.push(inputs.text);
    if (startedIterations.length === 2) {
      bothItemsStarted.resolve();
    }
    await releaseItems.promise;
    return { text: inputs.text };
  };

  try {
    const runPromise = executeWorkflow({
      nodes: [
        { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
        { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
        { id: 'iterate', type: 'iterateRun', data: { inputCount: 2 } },
        { id: 'clean', type: 'textClean', data: {} },
      ],
      edges: [
        edge('a-iterate', 'promptA', 'text', 'iterate', 'item1'),
        edge('b-iterate', 'promptB', 'text', 'iterate', 'item2'),
        edge('iterate-clean', 'iterate', 'text', 'clean', 'text'),
      ],
    }, { workflowExecution: { enabled: true, maxConcurrency: 16 } }, (event, data) => {
      events.push({ event, data });
    });

    await bothItemsStarted.promise;
    const cleanCompletionsBeforeRelease = events.filter((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && item.data.nodeId === 'clean'
    ));
    assert.deepEqual(startedIterations.sort(), ['alpha', 'beta']);
    assert.equal(cleanCompletionsBeforeRelease.length, 0);

    releaseItems.resolve();
    await runPromise;

    const cleanCompletions = events.filter((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && item.data.nodeId === 'clean'
    ));
    assert.equal(cleanCompletions.length, 2);
    assert.deepEqual(cleanCompletions.map((item) => item.data.iteration.index).sort(), [1, 2]);
  } finally {
    NODE_EXECUTORS.textClean = originalTextClean;
  }
});

test('iterateRun waits for concurrent item runs to settle before failing on one item error', async () => {
  const originalTextClean = NODE_EXECUTORS.textClean;
  const bothItemsStarted = createDeferred();
  const releaseItems = createDeferred();
  const startedIterations = [];
  const events = [];

  NODE_EXECUTORS.textClean = async (_node, inputs) => {
    startedIterations.push(inputs.text);
    if (startedIterations.length === 2) {
      bothItemsStarted.resolve();
    }
    await releaseItems.promise;
    if (inputs.text === 'alpha') {
      throw new Error('alpha failed');
    }
    return { text: inputs.text };
  };

  try {
    const runPromise = executeWorkflow({
      nodes: [
        { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
        { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
        { id: 'iterate', type: 'iterateRun', data: { inputCount: 2 } },
        { id: 'clean', type: 'textClean', data: {} },
      ],
      edges: [
        edge('a-iterate', 'promptA', 'text', 'iterate', 'item1'),
        edge('b-iterate', 'promptB', 'text', 'iterate', 'item2'),
        edge('iterate-clean', 'iterate', 'text', 'clean', 'text'),
      ],
    }, { workflowExecution: { enabled: true, maxConcurrency: 16 } }, (event, data) => {
      events.push({ event, data });
    });

    await bothItemsStarted.promise;
    releaseItems.resolve();
    await assert.rejects(runPromise, /alpha failed/);

    const cleanCompletions = events.filter((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED
      && item.data.nodeId === 'clean'
    ));
    const cleanFailures = events.filter((item) => (
      item.event === WORKFLOW_SSE_EVENTS.NODE_FAILED
      && item.data.nodeId === 'clean'
    ));

    assert.deepEqual(startedIterations.sort(), ['alpha', 'beta']);
    assert.equal(cleanCompletions.length, 1);
    assert.equal(cleanCompletions[0].data.outputs.text, 'beta');
    assert.equal(cleanFailures.length, 1);
    assert.equal(cleanFailures[0].data.iteration.index, 1);
  } finally {
    NODE_EXECUTORS.textClean = originalTextClean;
  }
});

test('merge nodes pass one grouped payload downstream', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
      { id: 'merge', type: 'textMerge', data: { inputCount: 2 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('a-merge', 'promptA', 'text', 'merge', 'item1'),
      edge('b-merge', 'promptB', 'text', 'merge', 'item2'),
      edge('merge-output', 'merge', 'merged', 'output', 'content'),
    ],
  });

  const mergeCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'merge',
  );
  const outputCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );

  assert.equal(mergeCompletions.length, 1);
  assert.equal(outputCompletions.length, 1);
  assert.deepEqual(mergeCompletions[0].data.outputs, { merged: ['alpha', 'beta'] });
  assert.deepEqual(outputCompletions[0].data.outputs.content, ['alpha', 'beta']);
});

test('merge nodes flatten grouped inputs from other merge nodes', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'promptA', type: 'textInput', data: { text: 'alpha' } },
      { id: 'promptB', type: 'textInput', data: { text: 'beta' } },
      { id: 'promptC', type: 'textInput', data: { text: 'gamma' } },
      { id: 'mergeA', type: 'textMerge', data: { inputCount: 2 } },
      { id: 'mergeB', type: 'textMerge', data: { inputCount: 2 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('a-merge-a', 'promptA', 'text', 'mergeA', 'item1'),
      edge('b-merge-a', 'promptB', 'text', 'mergeA', 'item2'),
      edge('merge-a-merge-b', 'mergeA', 'merged', 'mergeB', 'item1'),
      edge('c-merge-b', 'promptC', 'text', 'mergeB', 'item2'),
      edge('merge-b-output', 'mergeB', 'merged', 'output', 'content'),
    ],
  });

  const mergeBCompletion = events.find(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'mergeB',
  );
  const outputCompletion = events.find(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );

  assert.deepEqual(mergeBCompletion?.data.outputs, { merged: ['alpha', 'beta', 'gamma'] });
  assert.deepEqual(outputCompletion?.data.outputs.content, ['alpha', 'beta', 'gamma']);
});

test('iterateRun preserves per-item execution through merge nodes', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'static', type: 'textInput', data: { text: 'alpha' } },
      { id: 'itemA', type: 'textInput', data: { text: 'beta' } },
      { id: 'itemB', type: 'textInput', data: { text: 'gamma' } },
      { id: 'iterate', type: 'iterateRun', data: { inputCount: 2 } },
      { id: 'merge', type: 'textMerge', data: { inputCount: 2 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('static-merge', 'static', 'text', 'merge', 'item1'),
      edge('a-iterate', 'itemA', 'text', 'iterate', 'item1'),
      edge('b-iterate', 'itemB', 'text', 'iterate', 'item2'),
      edge('iterate-merge', 'iterate', 'text', 'merge', 'item2'),
      edge('merge-output', 'merge', 'merged', 'output', 'content'),
    ],
  });

  const mergeCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'merge',
  );
  const outputCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );

  assert.equal(mergeCompletions.length, 2);
  assert.equal(outputCompletions.length, 2);
  assert.deepEqual(mergeCompletions.map((item) => item.data.outputs), [
    { merged: ['alpha', 'beta'] },
    { merged: ['alpha', 'gamma'] },
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.outputs.content), [
    ['alpha', 'beta'],
    ['alpha', 'gamma'],
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.iteration.index), [1, 2]);
});

test('iterateImageRun preserves per-item execution through merge nodes', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'static', type: 'imageInput', data: { fileUrl: '/api/files/static.png' } },
      { id: 'itemA', type: 'imageInput', data: { fileUrl: '/api/files/a.png' } },
      { id: 'itemB', type: 'imageInput', data: { fileUrl: '/api/files/b.png' } },
      { id: 'iterate', type: 'iterateImageRun', data: { inputCount: 2 } },
      { id: 'merge', type: 'imageMerge', data: { inputCount: 2 } },
      { id: 'output', type: 'output', data: {} },
    ],
    edges: [
      edge('static-merge', 'static', 'image', 'merge', 'item1'),
      edge('a-iterate', 'itemA', 'image', 'iterate', 'item1'),
      edge('b-iterate', 'itemB', 'image', 'iterate', 'item2'),
      edge('iterate-merge', 'iterate', 'image', 'merge', 'item2'),
      edge('merge-output', 'merge', 'merged', 'output', 'content'),
    ],
  });

  const mergeCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'merge',
  );
  const outputCompletions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );

  assert.equal(mergeCompletions.length, 2);
  assert.equal(outputCompletions.length, 2);
  assert.deepEqual(mergeCompletions.map((item) => item.data.outputs), [
    { merged: ['/api/files/static.png', '/api/files/a.png'] },
    { merged: ['/api/files/static.png', '/api/files/b.png'] },
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.outputs.content), [
    ['/api/files/static.png', '/api/files/a.png'],
    ['/api/files/static.png', '/api/files/b.png'],
  ]);
  assert.deepEqual(outputCompletions.map((item) => item.data.iteration.index), [1, 2]);
});
