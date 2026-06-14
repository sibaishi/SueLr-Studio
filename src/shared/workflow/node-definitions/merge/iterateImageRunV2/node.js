/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const ITERATE_IMAGE_RUN_V2_NODE = {
  type: 'iterateImageRunV2',
  version: 2,
  label: '图像逐项',
  icon: 'repeat',
  color: '#FF9500',
  category: 'iterate',
  inputs: [{ id: 'input', label: '输入', type: 'any', required: false }],,
  outputs: [{ id: 'image', label: '当前图片', type: 'image' }],
  params: [],
  architect: { enabled: true, order: 12, defaults: {} },
  runtime: { mode: 'iterate-image' },
  supportsDisabledPassthrough: true,
};
