/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/**
 * @param {NodeTypeDef[]} registry
 */
export function createNodeRegistryIndex(registry) {
  return new Map(registry.map((node) => [node.type, node]));
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function getNodeDefFromIndex(registryByType, type) {
  return registryByType.get(type);
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 */
export function getRegisteredNodeTypesFromIndex(registryByType) {
  return [...registryByType.keys()];
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function getNodeTypeLabelFromIndex(registryByType, type) {
  return getNodeDefFromIndex(registryByType, type)?.label || type || '未知节点';
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function getRequiredInputsFromIndex(registryByType, type) {
  return (getNodeDefFromIndex(registryByType, type)?.inputs || [])
    .filter((input) => input.required)
    .map((input) => input.id);
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function getNodeDataDefaultsFromIndex(registryByType, type) {
  const params = getNodeDefFromIndex(registryByType, type)?.params || [];
  return params.reduce(
    (accumulator, param) => {
      if (param.default !== undefined) {
        accumulator[param.id] = param.default;
      }
      return accumulator;
    },
    /** @type {Record<string, unknown>} */ ({}),
  );
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function isExecutableNodeTypeFromIndex(registryByType, type) {
  const node = getNodeDefFromIndex(registryByType, type);
  return Boolean(node) && node.executable !== false;
}

/**
 * @param {Map<string, NodeTypeDef>} registryByType
 * @param {string} type
 */
export function supportsDisabledPassthroughFromIndex(registryByType, type) {
  return Boolean(getNodeDefFromIndex(registryByType, type)?.supportsDisabledPassthrough);
}
