import {
  WORKFLOW_NODE_REGISTRY,
  getNodeDataDefaults,
  getNodeDef,
  getNodeTypeLabel,
  getRegisteredNodeTypes,
  getRequiredInputs,
  isExecutableNodeType,
  resolveDynamicPortCount,
  supportsDisabledPassthrough,
} from '@/shared/workflow/node-registry';

export const NODE_REGISTRY = WORKFLOW_NODE_REGISTRY;

export {
  getNodeDataDefaults,
  getNodeDef,
  getNodeTypeLabel,
  getRegisteredNodeTypes,
  getRequiredInputs,
  isExecutableNodeType,
  resolveDynamicPortCount,
  supportsDisabledPassthrough,
};
