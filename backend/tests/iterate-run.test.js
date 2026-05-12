import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../src/engine/executor.js';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.js';

function edge(id, source, sourceHandle, target, targetHandle) {
  return { id, source, sourceHandle, target, targetHandle };
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
