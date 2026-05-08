/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const TEXT_MERGE_NODE = {
  type: 'textMerge',
  version: 1,
  label: '文本合并',
  icon: 'merge',
  color: '#007AFF',
  category: 'merge',
  inputs: [{ id: 'item', label: '文本', type: 'string', required: false, multiple: true }],
  outputs: [{ id: 'merged', label: '合并文本', type: 'string[]' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
