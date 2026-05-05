import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWorkflow } from '../engine/executor.js';
import { WORKFLOW_SSE_EVENTS } from '../src/platform/logging/workflow-events.js';

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
