/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IMAGE_INPUT_NODE = {
  type: 'imageInput',
  version: 1,
  label: '图像输入',
  icon: 'image',
  color: '#FF9500',
  category: 'input',
  inputs: [],
  outputs: [
    { id: 'image', label: '图像', type: 'image' },
    { id: 'mask', label: '遮罩', type: 'mask' },
  ],
  params: [{ id: 'fileUrl', label: '图像文件', type: 'text', default: '' }],
  supportsDisabledPassthrough: false,
};
