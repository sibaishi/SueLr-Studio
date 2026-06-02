/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const PROMPT_HELPER_NODE = {
  type: 'promptHelper',
  version: 1,
  label: '辅助提示词',
  icon: 'promptHelper',
  color: '#00C7BE',
  category: 'tool',
  inputs: [{ id: 'text', label: '基础提示词', type: 'string', required: false }],
  outputs: [{ id: 'prompt', label: '提示词', type: 'string' }],
  params: [],
  architect: { enabled: true, order: 15 },
  supportsDisabledPassthrough: true,
};
