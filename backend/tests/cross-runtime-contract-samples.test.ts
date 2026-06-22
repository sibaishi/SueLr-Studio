// @ts-nocheck
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const samples = JSON.parse(
  await readFile(new URL('../../tests/contracts/cross-runtime.samples.json', import.meta.url), 'utf8'),
);

test('contract samples: backend project-model normalization matches the frontend sample', async () => {
  const { normalizeProjectModels } = await import('../src/engine/helpers/projectModels.ts');
  assert.deepEqual(normalizeProjectModels(samples.projectModels.input), samples.projectModels.expected);
});

test('contract samples: execution snapshots preserve the shared wire fields', async () => {
  const { createExecutionSnapshot } = await import('../src/modules/execution/execution-snapshot.ts');
  const snapshot = createExecutionSnapshot({
    persistedWorkflow: samples.executionSnapshot.persistedWorkflow,
    draftWorkflow: samples.executionSnapshot.draftWorkflow,
    runId: samples.executionSnapshot.expected.runId,
  });

  for (const [key, value] of Object.entries(samples.executionSnapshot.expected)) {
    assert.deepEqual(snapshot[key], value);
  }
});

test('contract samples: runtime capabilities expose the frontend-consumed shape', async () => {
  const { getRuntimeCapabilities } = await import('../src/platform/runtime/capabilities.ts');
  const capabilities = getRuntimeCapabilities('local-web');

  assert.equal(capabilities.mode, samples.runtimeCapabilities.mode);
  assert.equal(capabilities.canSelectDirectory, samples.runtimeCapabilities.canSelectDirectory);
  assert.equal(capabilities.canRestartBackend, samples.runtimeCapabilities.canRestartBackend);
  assert.equal(capabilities.hasEmbeddedShell, samples.runtimeCapabilities.hasEmbeddedShell);
  assert.equal(capabilities.search.provider, samples.runtimeCapabilities.search.provider);
  assert.equal(typeof capabilities.search.enabled, 'boolean');
  assert.equal(typeof capabilities.search.disabledReason, 'string');
});

test('contract samples: intelligence wire schema fills stable optional fields', async () => {
  const { agentPlanWireSchema } = await import(
    '../src/modules/intelligence/contracts/agent-plan-wire.schema.ts'
  );
  const parsed = agentPlanWireSchema.parse(samples.agentPlanWire);

  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.knowledgeContext, { source: 'none', items: [] });
});
