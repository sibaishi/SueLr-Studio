/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const UNIVERSAL_MERGE_NODE = {
  type: 'universalMerge',
  version: 1,
  label: '通用合并',
  icon: 'merge',
  color: '#64D2FF',
  category: 'merge',
  inputs: [{ id: 'item', label: '素材', type: 'any', required: false, multiple: true }],
  outputs: [{ id: 'merged', label: '合并素材', type: 'any[]' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
