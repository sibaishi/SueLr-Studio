/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS, RATIO_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const IMAGE_GEN_NODE = {
  type: 'imageGen',
  version: 1,
  label: '图像生成',
  icon: 'palette',
  color: '#FF9500',
  category: 'ai',
  inputs: [
    { id: 'prompt', label: '提示词', type: 'string', required: true },
    { id: 'reference', label: '参考图片', type: 'image', required: false },
    { id: 'mask', label: '遮罩图', type: 'mask', required: false },
    { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
  ],
  outputs: [{ id: 'images', label: '生成图片', type: 'image[]' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
    { id: 'ratio', label: '图片比例', type: 'select', default: 'auto', options: RATIO_OPTIONS, group: 'ratioCount' },
    {
      id: 'quality',
      label: '质量',
      type: 'select',
      default: 'high',
      options: [
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
        { label: 'auto', value: 'auto' },
      ],
      group: 'qualityFormat',
    },
    { id: 'n', label: '张数', type: 'number', min: 1, max: 8, default: 1, group: 'ratioCount' },
    { id: 'width', label: '宽', type: 'number', min: 16, default: 0, group: 'widthHeight' },
    { id: 'height', label: '高', type: 'number', min: 16, default: 0, group: 'widthHeight' },
    {
      id: 'output_format',
      label: '格式',
      type: 'select',
      default: 'png',
      options: [
        { label: 'png', value: 'png' },
        { label: 'jpeg', value: 'jpeg' },
        { label: 'webp', value: 'webp' },
      ],
      group: 'qualityFormat',
    },
  ],
  supportsDisabledPassthrough: true,
};
