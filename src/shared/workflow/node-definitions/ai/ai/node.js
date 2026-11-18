/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const AI_NODE = {
  type: 'ai',
  version: 1,
  label: 'AI',
  icon: 'bot',
  color: '#0A84FF',
  category: 'ai',
  inputs: [{ id: 'input', label: '输入', type: 'any', required: false }],
  outputs: [{ id: 'result', label: '结果', type: 'any' }],
  params: [{ id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' }],
  supportsDisabledPassthrough: true,
};
