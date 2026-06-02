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
  'textInput',
  'imageInput',
  'maskInput',
  'videoInput',
  'audioInput',
  'apiKeyInput',
  'textMerge',
  'imageMerge',
  'videoMerge',
  'audioMerge',
  'iterateRun',
  'iterateImageRun',
  'imageResize',
  'imageSplit',
  'imageCompare',
  'promptHelper',
  'textClean',
  'textSplit',
  'aiChat',
  'imageGen',
  'videoGen',
  'saveFile',
  'output',
];

test('workflow node catalog preserves the architect node allowlist and dynamic port contracts', () => {
  assert.deepEqual(getWorkflowArchitectNodeTypes(), EXPECTED_ARCHITECT_NODE_TYPES);
  assert.deepEqual(getWorkflowValidationInputNodeTypes(), [
    'textInput',
    'imageInput',
    'maskInput',
    'videoInput',
    'audioInput',
  ]);
  assert.deepEqual(getWorkflowArchitectVariableInputNodeTypes(), [
    'textMerge',
    'imageMerge',
    'videoMerge',
    'audioMerge',
    'iterateRun',
    'iterateImageRun',
  ]);
  assert.deepEqual(getWorkflowArchitectVariableOutputNodeTypes(), ['imageSplit', 'textSplit']);

  const ports = getWorkflowValidationNodePortDefs();
  assert.deepEqual(ports.textInput, {
    inputs: {},
    outputs: { text: { type: 'string' } },
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
  assert.deepEqual(ports.output, {
    inputs: { content: { type: 'any', required: true } },
    outputs: {},
    dynamicOutputInputs: { prefix: 'content', type: 'any', min: 1, max: 9 },
  });
});

test('workflow node catalog preserves architect defaults and agent knowledge coverage', () => {
  assert.deepEqual(getWorkflowArchitectDefaultData('aiChat'), {
    model: '',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
  });
  assert.deepEqual(getWorkflowArchitectDefaultData('textClean'), {
    startKeyword: '<think>',
    endKeyword: '</think>',
  });
  assert.deepEqual(getWorkflowArchitectDefaultData('saveFile'), { outputPath: '' });
  assert.deepEqual(getWorkflowArchitectDefaultData('imageSplit'), { rows: 3, columns: 3 });

  const capabilityNodeTypes = WORKFLOW_NODE_CAPABILITY_SEEDS.map((seed) => seed.structured.nodeType).sort();
  assert.deepEqual(capabilityNodeTypes, [...EXPECTED_ARCHITECT_NODE_TYPES].sort());
});

test('workflow node registry declares agent input adapters and iterative runtime modes', () => {
  assert.deepEqual(
    getWorkflowAgentInputNodeDefs().map(({ type, adapter }) => ({ type, adapter })),
    [
      { type: 'textInput', adapter: 'text' },
      { type: 'imageInput', adapter: 'image' },
      { type: 'maskInput', adapter: 'mask' },
      { type: 'videoInput', adapter: 'video' },
      { type: 'audioInput', adapter: 'audio' },
    ],
  );
  assert.equal(getNodeDef('iterateRun')?.runtime?.mode, 'iterate-text');
  assert.equal(getNodeDef('iterateImageRun')?.runtime?.mode, 'iterate-image');
});
