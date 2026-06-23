// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { executeWorkflow } from '../src/engine/executor.ts';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.ts';

function edge(id, source, target) {
  return {
    id,
    source,
    sourceHandle: 'result',
    target,
    targetHandle: 'input',
  };
}

async function runWorkflow(workflow) {
  const events = [];
  await executeWorkflow(workflow, {}, (event, data) => events.push({ event, data }));
  return events;
}

test('iterating materialProcess splits text and executes downstream once per result', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'source', type: 'io', data: { content: 'alpha##beta##gamma' } },
      {
        id: 'process',
        type: 'materialProcess',
        data: {
          materialType: 'text',
          splitEnabled: true,
          iterateEnabled: true,
          separator: '##',
          outputCount: 3,
        },
      },
      { id: 'output', type: 'io', data: {} },
    ],
    edges: [edge('source-process', 'source', 'process'), edge('process-output', 'process', 'output')],
  });

  const completions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );
  assert.deepEqual(completions.map((item) => item.data.outputs.result), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(completions.map((item) => item.data.iteration.index), [1, 2, 3]);
});

test('iterate-only materialProcess expands an upstream array', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'source', type: 'io', data: { content: ['alpha', 'beta'] } },
      {
        id: 'process',
        type: 'materialProcess',
        data: { materialType: 'text', splitEnabled: false, iterateEnabled: true },
      },
      { id: 'output', type: 'io', data: {} },
    ],
    edges: [edge('source-process', 'source', 'process'), edge('process-output', 'process', 'output')],
  });

  const completions = events.filter(
    (item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && item.data.nodeId === 'output',
  );
  assert.deepEqual(completions.map((item) => item.data.outputs.result), ['alpha', 'beta']);
});

test('parallel branches may each use an iterating materialProcess', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'source-a', type: 'io', data: { content: 'A' } },
      { id: 'source-b', type: 'io', data: { content: 'B' } },
      {
        id: 'process-a',
        type: 'materialProcess',
        data: { materialType: 'text', splitEnabled: false, iterateEnabled: true },
      },
      {
        id: 'process-b',
        type: 'materialProcess',
        data: { materialType: 'text', splitEnabled: false, iterateEnabled: true },
      },
      { id: 'output-a', type: 'io', data: {} },
      { id: 'output-b', type: 'io', data: {} },
    ],
    edges: [
      edge('source-a-process-a', 'source-a', 'process-a'),
      edge('process-a-output-a', 'process-a', 'output-a'),
      edge('source-b-process-b', 'source-b', 'process-b'),
      edge('process-b-output-b', 'process-b', 'output-b'),
    ],
  });

  assert.equal(events.some((item) => item.event === WORKFLOW_SSE_EVENTS.VALIDATION_FAILED), false);
  assert.equal(
    events.filter((item) => item.event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED && /^output-/.test(item.data.nodeId))
      .length,
    2,
  );
});

test('nested iterating materialProcess nodes are rejected before execution', async () => {
  const events = await runWorkflow({
    nodes: [
      { id: 'source', type: 'io', data: { content: 'A' } },
      {
        id: 'outer',
        type: 'materialProcess',
        data: { materialType: 'text', splitEnabled: false, iterateEnabled: true },
      },
      {
        id: 'inner',
        type: 'materialProcess',
        data: { materialType: 'text', splitEnabled: false, iterateEnabled: true },
      },
    ],
    edges: [edge('source-outer', 'source', 'outer'), edge('outer-inner', 'outer', 'inner')],
  });

  const failure = events.find((item) => item.event === WORKFLOW_SSE_EVENTS.VALIDATION_FAILED);
  assert.match(failure?.data.error || '', /只能有一个启用逐项的素材处理节点/);
});
