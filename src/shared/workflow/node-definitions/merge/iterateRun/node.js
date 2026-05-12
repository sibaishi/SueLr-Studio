/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const ITERATE_RUN_NODE = {
  type: 'iterateRun',
  version: 1,
  label: '文本逐项',
  icon: 'repeat',
  color: '#007AFF',
  category: 'iterate',
  inputs: [{ id: 'item', label: '文本', type: 'string', required: false, multiple: true }],
  outputs: [{ id: 'text', label: '当前文本', type: 'string' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
