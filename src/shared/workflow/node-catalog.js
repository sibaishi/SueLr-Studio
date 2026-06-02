import { WORKFLOW_NODE_REGISTRY } from './node-registry.js';

const NODE_DEFS_BY_TYPE = new Map(WORKFLOW_NODE_REGISTRY.map((node) => [node.type, node]));

const ARCHITECT_NODE_TYPES = WORKFLOW_NODE_REGISTRY.filter((node) => node.architect?.enabled)
  .sort(
    (left, right) =>
      (left.architect?.order || Number.MAX_SAFE_INTEGER) - (right.architect?.order || Number.MAX_SAFE_INTEGER),
  )
  .map((node) => node.type);

const VALIDATION_PORT_OVERRIDES = {
  textInput: { inputs: {} },
};

/** @param {{ id: string; type: string; required?: boolean }[]} ports */
function toValidationPortMap(ports) {
  return Object.fromEntries(
    ports.map((port) => [
      port.id,
      {
        type: port.type,
        ...(port.required ? { required: true } : {}),
      },
    ]),
  );
}

/** @param {string} type */
export function getWorkflowValidationNodePortDef(type) {
  const node = NODE_DEFS_BY_TYPE.get(type);
  if (!node || !ARCHITECT_NODE_TYPES.includes(type)) return undefined;
  const override = VALIDATION_PORT_OVERRIDES[type] || {};
  return {
    inputs: override.inputs || (node.dynamicInputs ? {} : toValidationPortMap(node.inputs)),
    outputs: override.outputs || toValidationPortMap(node.outputs),
    ...(node.dynamicInputs ? { dynamicInputs: node.dynamicInputs } : {}),
    ...(node.dynamicOutputs ? { dynamicOutputs: node.dynamicOutputs, outputs: override.outputs || {} } : {}),
    ...(node.dynamicOutputInputs ? { dynamicOutputInputs: node.dynamicOutputInputs } : {}),
  };
}

export function getWorkflowValidationNodePortDefs() {
  return Object.fromEntries(
    ARCHITECT_NODE_TYPES.map((type) => [type, getWorkflowValidationNodePortDef(type)]).filter((entry) => entry[1]),
  );
}

export function getWorkflowArchitectNodeTypes() {
  return [...ARCHITECT_NODE_TYPES];
}

/** @param {string} type */
export function getWorkflowArchitectDefaultData(type) {
  return { ...(NODE_DEFS_BY_TYPE.get(type)?.architect?.defaults || {}) };
}

export function getWorkflowArchitectVariableInputNodeTypes() {
  return ARCHITECT_NODE_TYPES.filter((type) => Boolean(getWorkflowValidationNodePortDef(type)?.dynamicInputs));
}

export function getWorkflowArchitectVariableOutputNodeTypes() {
  return ARCHITECT_NODE_TYPES.filter((type) => Boolean(getWorkflowValidationNodePortDef(type)?.dynamicOutputs));
}

export function getWorkflowValidationInputNodeTypes() {
  return ARCHITECT_NODE_TYPES.filter((type) => NODE_DEFS_BY_TYPE.get(type)?.category === 'input');
}

export function getWorkflowAgentInputNodeDefs() {
  return WORKFLOW_NODE_REGISTRY.filter((node) => node.agentInput).map((node) => ({
    type: node.type,
    ...node.agentInput,
  }));
}
