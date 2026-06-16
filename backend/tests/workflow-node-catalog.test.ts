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

const EXPECTED_ARCHITECT_NODE_TYPES = [
  'io',
  'iterateRun',
  'iterateImageRun',
  'imageSplit',
  'promptHelper',
  'textClean',
  'textSplit',
  'aiV3',
];

test('workflow node catalog preserves the architect node allowlist and dynamic port contracts', () => {
  assert.deepEqual(getWorkflowArchitectNodeTypes(), EXPECTED_ARCHITECT_NODE_TYPES);
  assert.deepEqual(getWorkflowValidationInputNodeTypes(), ['io']);
  assert.deepEqual(getWorkflowArchitectVariableInputNodeTypes(), [
    'iterateRun',
    'iterateImageRun',
  ]);
  assert.deepEqual(getWorkflowArchitectVariableOutputNodeTypes(), ['imageSplit', 'textSplit']);

  const ports = getWorkflowValidationNodePortDefs();
  assert.deepEqual(ports.io, {
    inputs: { input: { type: 'any' } },
    outputs: { result: { type: 'any' } },
  });
  assert.deepEqual(ports.textSplit, {
    inputs: { text: { type: 'string', required: true } },
    outputs: {},
    dynamicOutputs: { prefix: 'part', type: 'string', countDataKey: 'outputCount', min: 1, max: 9 },
  });
  assert.deepEqual(ports.imageSplit, {
    inputs: { image: { type: 'image', required: true } },
    outputs: {},
    dynamicOutputs: {
      prefix: 'part',
      type: 'image',
      countDataKeys: ['rows', 'columns'],
      countOperation: 'multiply',
      min: 1,
      max: 9,
    },
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
  assert.deepEqual(getWorkflowArchitectDefaultData('textClean'), {
    startKeyword: '<think>',
    endKeyword: '</think>',
  });
  assert.deepEqual(getWorkflowArchitectDefaultData('imageSplit'), { rows: 3, columns: 3 });

  const capabilityNodeTypes = WORKFLOW_NODE_CAPABILITY_SEEDS.map((seed) => seed.structured.nodeType).sort();
  assert.deepEqual(capabilityNodeTypes, [...EXPECTED_ARCHITECT_NODE_TYPES].sort());
});

test('workflow node registry declares agent input adapters and iterative runtime modes', () => {
  assert.deepEqual(
    getWorkflowAgentInputNodeDefs().map(({ type, adapter }) => ({ type, adapter })),
    [{ type: 'io', adapter: 'text' }],
  );
  assert.equal(getNodeDef('iterateRun')?.runtime?.mode, 'iterate-text');
  assert.equal(getNodeDef('iterateImageRun')?.runtime?.mode, 'iterate-image');
});
