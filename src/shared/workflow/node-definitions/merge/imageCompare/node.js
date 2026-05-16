/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IMAGE_COMPARE_NODE = {
  type: 'imageCompare',
  version: 1,
  label: '图片对比',
  icon: 'image',
  color: '#FF9500',
  category: 'tool',
  inputs: [
    { id: 'image1', label: '图片1', type: 'image', required: true },
    { id: 'image2', label: '图片2', type: 'image', required: true },
  ],
  outputs: [],
  params: [],
  supportsDisabledPassthrough: false,
};
