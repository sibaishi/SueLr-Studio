/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS, RATIO_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const IMAGE_GEN_V2_NODE = {
  type: 'imageGenV2',
  version: 1,
  label: '图像生成 V2',
  icon: 'palette',
  color: '#FF9500',
  category: 'ai',
  inputs: [
    { id: 'input', label: '输入', type: 'any', required: false },
  ],
  outputs: [{ id: 'images', label: '生成图片', type: 'image[]' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
    { id: 'ratio', label: '图片比例', type: 'select', default: 'auto', options: RATIO_OPTIONS, group: 'ratioCount' },
    {
      id: 'resolution',
      label: '输出档位',
      type: 'select',
      default: 'auto',
      options: [
        { label: 'auto', value: 'auto' },
        { label: '512px', value: '512px' },
        { label: '1k', value: '1k' },
        { label: '2k', value: '2k' },
        { label: '4k', value: '4k' },
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
  architect: {
    enabled: true,
    order: 19.5,
    defaults: { model: '', ratio: 'auto', resolution: 'auto', n: 1, output_format: 'png' },
  },
  supportsDisabledPassthrough: true,
};
