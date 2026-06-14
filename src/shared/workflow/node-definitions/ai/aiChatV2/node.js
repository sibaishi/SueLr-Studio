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
    { id: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
    { id: 'maxTokens', label: '最大 Token', type: 'number', min: 1, max: 32000, default: 4096 },
    { id: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '' },
  ],
  architect: { enabled: true, order: 18.5, defaults: { model: '', temperature: 0.7, maxTokens: 4096, systemPrompt: '' } },
  supportsDisabledPassthrough: true,
};
