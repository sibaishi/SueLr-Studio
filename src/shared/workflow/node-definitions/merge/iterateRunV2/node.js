/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const ITERATE_RUN_V2_NODE = {
  type: 'iterateRunV2',
  version: 2,
  label: '文本逐项',
  icon: 'repeat',
  color: '#007AFF',
  category: 'iterate',
  inputs: [{ id: 'input', label: '文本', type: 'string', required: false }],
  outputs: [{ id: 'text', label: '当前文本', type: 'string' }],
  params: [],
  architect: { enabled: true, order: 11, defaults: {} },
  runtime: { mode: 'iterate-text' },
  supportsDisabledPassthrough: true,
};
