/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IMAGE_RESIZE_NODE = {
  type: 'imageResize',
  version: 1,
  label: '图像缩放',
  icon: 'resize',
  color: '#FF9F0A',
  category: 'merge',
  inputs: [{ id: 'image', label: '原图', type: 'image', required: true }],
  outputs: [{ id: 'image', label: '缩放后图像', type: 'image' }],
  params: [
    {
      id: 'resizeMode',
      label: '缩放模式',
      type: 'select',
      default: 'percent',
      options: [
        { label: '按百分比', value: 'percent' },
        { label: '按尺寸', value: 'dimensions' },
      ],
    },
    { id: 'scalePercent', label: '缩放比例（%）', type: 'number', min: 1, max: 1000, default: 100 },
    { id: 'targetWidth', label: '目标宽度', type: 'number', min: 1, default: 1024, group: 'resizeDimensions' },
    { id: 'targetHeight', label: '目标高度', type: 'number', min: 1, default: 1024, group: 'resizeDimensions' },
  ],
  supportsDisabledPassthrough: true,
};
