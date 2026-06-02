import { AI_NODES } from './node-definitions/ai-nodes.js';
import { API_NODES } from './node-definitions/api-nodes.js';
import { GROUP_NODES } from './node-definitions/group-nodes.js';
import { INPUT_NODES } from './node-definitions/input-nodes.js';
import { MERGE_NODES } from './node-definitions/merge-nodes.js';
import { OUTPUT_NODES } from './node-definitions/output-nodes.js';
/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import {
  createNodeRegistryIndex,
  getNodeDataDefaultsFromIndex,
  getNodeDefFromIndex,
  getNodeTypeLabelFromIndex,
  getRegisteredNodeTypesFromIndex,
  getRequiredInputsFromIndex,
  isExecutableNodeTypeFromIndex,
  resolveDynamicPortCount,
  supportsDisabledPassthroughFromIndex,
} from './node-registry-helpers.js';

/** @type {NodeTypeDef[]} */
export const WORKFLOW_NODE_REGISTRY = [
  ...GROUP_NODES,
  ...INPUT_NODES,
  ...API_NODES,
  ...MERGE_NODES,
  ...AI_NODES,
  ...OUTPUT_NODES,
];

/** @type {Map<string, NodeTypeDef>} */
const NODE_REGISTRY_BY_TYPE = createNodeRegistryIndex(WORKFLOW_NODE_REGISTRY);

/** @param {string} type */
export function getNodeDef(type) {
  return getNodeDefFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

/** @param {string} type */
export function getNodeTypeLabel(type) {
  return getNodeTypeLabelFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

export function getRegisteredNodeTypes() {
  return getRegisteredNodeTypesFromIndex(NODE_REGISTRY_BY_TYPE);
}

/** @param {string} type */
export function getRequiredInputs(type) {
  return getRequiredInputsFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

/** @param {string} type */
export function getNodeDataDefaults(type) {
  return getNodeDataDefaultsFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

/** @param {string} type */
export function isExecutableNodeType(type) {
  return isExecutableNodeTypeFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

/** @param {string} type */
export function supportsDisabledPassthrough(type) {
  return supportsDisabledPassthroughFromIndex(NODE_REGISTRY_BY_TYPE, type);
}

export { resolveDynamicPortCount };
