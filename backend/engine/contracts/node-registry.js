import {
  WORKFLOW_NODE_REGISTRY as NODE_CONTRACTS,
  getNodeDef as getSharedNodeDef,
  getNodeDataDefaults,
  getNodeTypeLabel,
  getRegisteredNodeTypes,
  getRequiredInputs,
  isExecutableNodeType,
  supportsDisabledPassthrough,
} from '../../../src/shared/workflow/node-registry.js';

const NODE_CONTRACTS_BY_TYPE = new Map(NODE_CONTRACTS.map((contract) => [contract.type, contract]));

export function getNodeContract(type) {
  return getSharedNodeDef(type) || NODE_CONTRACTS_BY_TYPE.get(type);
}

export { getRegisteredNodeTypes, getRequiredInputs, getNodeTypeLabel, getNodeDataDefaults, isExecutableNodeType, supportsDisabledPassthrough };
