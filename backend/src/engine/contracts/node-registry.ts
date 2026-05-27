import {
  WORKFLOW_NODE_REGISTRY as NODE_CONTRACTS,
  getNodeDataDefaults,
  getNodeTypeLabel,
  getRegisteredNodeTypes,
  getRequiredInputs,
  getNodeDef as getSharedNodeDef,
  isExecutableNodeType,
  supportsDisabledPassthrough,
} from '../../../../src/shared/workflow/node-registry.js';
import type { NodeTypeDef } from '../../../../src/shared/workflow/types.ts';

const NODE_CONTRACTS_BY_TYPE = new Map<string, NodeTypeDef>(
  NODE_CONTRACTS.map((contract) => [contract.type, contract]),
);

export function getNodeContract(type: string): NodeTypeDef | undefined {
  return getSharedNodeDef(type) || NODE_CONTRACTS_BY_TYPE.get(type);
}

export {
  getNodeDataDefaults,
  getNodeTypeLabel,
  getRegisteredNodeTypes,
  getRequiredInputs,
  isExecutableNodeType,
  supportsDisabledPassthrough,
};
