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

test('iterateRun validates single control node limit', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'iterateA', type: 'iterateRun', data: {} },
      { id: 'iterateB', type: 'iterateRun', data: {} },
    ],
    edges: [],
  });

  assert.deepEqual(events, [{
    event: WORKFLOW_SSE_EVENTS.VALIDATION_FAILED,
    data: { error: '当前版本仅支持一个逐项运行节点' },
  }]);
});
