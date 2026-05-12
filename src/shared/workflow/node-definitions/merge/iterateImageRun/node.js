/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const ITERATE_IMAGE_RUN_NODE = {
  type: 'iterateImageRun',
  version: 1,
  label: '图像逐项',
  icon: 'repeat',
  color: '#FF9500',
  category: 'iterate',
  inputs: [{ id: 'item', label: '图片', type: 'image', required: false, multiple: true }],
  outputs: [{ id: 'image', label: '当前图片', type: 'image' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
