import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getWorkflowAgentInputNodeDefs,
  getWorkflowArchitectDefaultData,
  getWorkflowArchitectNodeTypes,
  getWorkflowArchitectVariableInputNodeTypes,
  getWorkflowArchitectVariableOutputNodeTypes,
  getWorkflowValidationInputNodeTypes,
  getWorkflowValidationNodePortDefs,
} from '../../src/shared/workflow/node-catalog.js';
import { getNodeDef } from '../../src/shared/workflow/node-registry.js';
import { WORKFLOW_NODE_CAPABILITY_SEEDS } from '../src/modules/intelligence/workflow-builder/node-capabilities.ts';

const EXPECTED_ARCHITECT_NODE_TYPES = ['io', 'materialProcess', 'promptHelper', 'aiV3'];

test('workflow node catalog preserves the architect node allowlist and dynamic port contracts', () => {
  assert.deepEqual(getWorkflowArchitectNodeTypes(), EXPECTED_ARCHITECT_NODE_TYPES);
  assert.deepEqual(getWorkflowValidationInputNodeTypes(), ['io']);
  assert.deepEqual(getWorkflowArchitectVariableInputNodeTypes(), []);
  assert.deepEqual(getWorkflowArchitectVariableOutputNodeTypes(), []);

  const ports = getWorkflowValidationNodePortDefs();
  assert.deepEqual(ports.io, {
    inputs: { input: { type: 'any' } },
    outputs: { result: { type: 'any' } },
  });
  assert.deepEqual(ports.materialProcess, {
    inputs: { input: { type: 'any', required: true } },
    outputs: { result: { type: 'any' } },
  });
  assert.deepEqual(ports.aiV3, {
    inputs: { input: { type: 'any' } },
    outputs: { result: { type: 'any' } },
  });
});

test('workflow node catalog preserves architect defaults and agent knowledge coverage', () => {
  assert.deepEqual(getWorkflowArchitectDefaultData('aiV3'), {
    model: '',
  });
  assert.deepEqual(getWorkflowArchitectDefaultData('io'), { text: '', content: [], _fileIds: [], _fileKinds: [] });
  assert.deepEqual(getWorkflowArchitectDefaultData('materialProcess'), {
    materialType: 'auto',
    splitEnabled: true,
    iterateEnabled: false,
    separator: '\n',
    outputCount: 2,
    rows: 3,
    columns: 3,
  });

  const capabilityNodeTypes = WORKFLOW_NODE_CAPABILITY_SEEDS.map((seed) => seed.structured.nodeType).sort();
  assert.deepEqual(capabilityNodeTypes, [...EXPECTED_ARCHITECT_NODE_TYPES].sort());
  const aiV3Capability = WORKFLOW_NODE_CAPABILITY_SEEDS.find((seed) => seed.structured.nodeType === 'aiV3');
  assert.equal(aiV3Capability?.id, 'seed_workflow_node_aiV3');
  assert.equal(aiV3Capability?.structured.params?.includes('mjMode'), true);
});

test('workflow node registry declares agent input adapters and material runtime mode', () => {
  assert.deepEqual(
    getWorkflowAgentInputNodeDefs().map(({ type, adapter }) => ({ type, adapter })),
    [{ type: 'io', adapter: 'text' }],
  );
  assert.equal(getNodeDef('materialProcess')?.runtime?.mode, 'material-process');
});
