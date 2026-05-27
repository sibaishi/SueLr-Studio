// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

test('execution snapshot keeps persisted workflow identity and draft source', async () => {
  const { createExecutionSnapshot, CURRENT_SNAPSHOT_VERSION } = await import(`../src/modules/execution/execution-snapshot.ts?test=${Date.now()}`);

  const snapshot = createExecutionSnapshot({
    persistedWorkflow: {
      id: 'wf_persisted',
      name: 'Persisted Workflow',
      version: 1,
      createdAt: 10,
      updatedAt: 20,
      nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'persisted' } }],
      edges: [],
      settings: {},
    },
    draftWorkflow: {
      id: 'wf_draft_payload',
      name: 'Draft Workflow',
      version: 1,
      createdAt: 10,
      updatedAt: 20,
      nodes: [{ id: 'node-1', type: 'textInput', position: { x: 4, y: 8 }, data: { text: 'draft' } }],
      edges: [],
      settings: {},
    },
    runId: 'run_test_1',
  });

  assert.equal(snapshot.runId, 'run_test_1');
  assert.equal(snapshot.workflowId, 'wf_persisted');
  assert.equal(snapshot.source, 'draft');
  assert.equal(snapshot.snapshotVersion, CURRENT_SNAPSHOT_VERSION);
  assert.equal(snapshot.nodes[0].data.text, 'draft');
  assert.equal(snapshot.nodes[0].position.x, 4);
});

test('execution snapshot generates persisted source when no draft exists', async () => {
  const { createExecutionSnapshot } = await import(`../src/modules/execution/execution-snapshot.ts?test=${Date.now()}`);

  const snapshot = createExecutionSnapshot({
    persistedWorkflow: {
      id: 'wf_only_persisted',
      name: 'Persisted Only',
      version: 1,
      createdAt: 11,
      updatedAt: 22,
      nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      settings: {},
    },
  });

  assert.equal(snapshot.workflowId, 'wf_only_persisted');
  assert.equal(snapshot.source, 'persisted');
  assert.match(snapshot.runId, /wf_only_persisted$/);
});
