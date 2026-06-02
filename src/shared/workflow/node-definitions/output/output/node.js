/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const OUTPUT_NODE = {
  type: 'output',
  version: 1,
  label: '输出展示',
  icon: 'eye',
  color: '#8E8E93',
  category: 'output',
  inputs: [{ id: 'content', label: '内容', type: 'any', required: true }],
  outputs: [],
  params: [],
  dynamicOutputInputs: { prefix: 'content', type: 'any', min: 1, max: 9 },
  architect: { enabled: true, order: 22 },
  supportsDisabledPassthrough: false,
};
