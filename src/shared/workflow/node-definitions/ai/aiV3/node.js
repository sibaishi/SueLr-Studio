/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const AI_V3_NODE = {
  type: 'aiV3',
  version: 1,
  label: 'AI 能力 V3',
  icon: 'bot',
  color: '#0A84FF',
  category: 'ai',
  inputs: [
    { id: 'input', label: '输入', type: 'any', required: false },
  ],
  outputs: [{ id: 'result', label: '结果', type: 'any' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
  ],
  architect: { enabled: true, order: 21, defaults: { model: '' } },
  supportsDisabledPassthrough: true,
};
