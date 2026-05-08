/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import { EMPTY_OPTIONS } from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const AI_CHAT_NODE = {
  type: 'aiChat',
  version: 1,
  label: 'AI 对话',
  icon: 'bot',
  color: '#30D158',
  category: 'ai',
  inputs: [
    { id: 'prompt', label: '提示词', type: 'string', required: true },
    { id: 'image', label: '图像', type: 'image', required: false },
    { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
  ],
  outputs: [{ id: 'response', label: '回复', type: 'string' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '', group: 'aiChatTop' },
    { id: 'enableWebSearch', label: '联网搜索', type: 'toggle', default: false, group: 'aiChatTop' },
    { id: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
    { id: 'maxTokens', label: '最大 Token', type: 'number', min: 1, max: 32000, default: 4096 },
    { id: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '' },
  ],
  supportsDisabledPassthrough: true,
};
