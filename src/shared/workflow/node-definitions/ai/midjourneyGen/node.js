/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const MIDJOURNEY_GEN_NODE = {
  type: 'midjourneyGen',
  version: 1,
  label: 'Midjourney 生图',
  icon: 'image',
  color: '#FF9500',
  category: 'ai',
  inputs: [
    { id: 'input', label: '输入', type: 'any', required: false },
  ],
  outputs: [
    { id: 'result', label: '结果', type: 'any' },
  ],
  params: [
    { id: 'model', label: 'Midjourney 模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
    {
      id: 'mode',
      label: '生成模式',
      type: 'select',
      default: 'fast',
      options: [
        { label: 'Fast', value: 'fast' },
        { label: 'Relax', value: 'relax' },
        { label: 'Turbo', value: 'turbo' },
      ],
    },
  ],
  architect: { enabled: true, order: 22, defaults: { model: '', mode: 'fast' } },
  supportsDisabledPassthrough: true,
};
