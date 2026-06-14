/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const AI_CHAT_V2_NODE = {
  type: 'aiChatV2',
  version: 1,
  label: 'AI 对话',
  icon: 'bot',
  color: '#30D158',
  category: 'ai',
  inputs: [
    { id: 'input', label: '输入', type: 'any', required: false },
  ],
  outputs: [{ id: 'response', label: '回复', type: 'string' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
    { id: 'enableWebSearch', label: '联网搜索', type: 'toggle', default: false },
    { id: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '' },
  ],
  architect: { enabled: true, order: 18.5, defaults: { model: '', systemPrompt: '' } },
  supportsDisabledPassthrough: true,
};
