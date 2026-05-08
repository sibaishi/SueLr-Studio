/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IMAGE_MERGE_NODE = {
  type: 'imageMerge',
  version: 1,
  label: '图片合并',
  icon: 'merge',
  color: '#FF9500',
  category: 'merge',
  inputs: [{ id: 'item', label: '图片', type: 'image', required: false, multiple: true }],
  outputs: [{ id: 'merged', label: '合并图片', type: 'image[]' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
