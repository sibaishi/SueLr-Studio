/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const TEXT_INPUT_NODE = {
  type: 'textInput',
  version: 1,
  label: '文本输入',
  icon: 'pen',
  color: '#007AFF',
  category: 'input',
  inputs: [{ id: 'input', label: '上游文本', type: 'string', required: false }],
  outputs: [{ id: 'text', label: '文本', type: 'string' }],
  params: [{ id: 'text', label: '文本内容', type: 'textarea', default: '' }],
  architect: { enabled: true, order: 1, defaults: { text: '' } },
  agentInput: {
    aliases: ['textinput', 'text', 'prompt', 'question', '\u6587\u672c\u8f93\u5165', '\u6587\u672c'],
    adapter: 'text',
  },
  supportsDisabledPassthrough: false,
};
