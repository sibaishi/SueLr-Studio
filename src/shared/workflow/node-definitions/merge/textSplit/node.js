/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const TEXT_SPLIT_NODE = {
  type: 'textSplit',
  version: 1,
  label: '文本拆分',
  icon: 'split',
  color: '#0A84FF',
  category: 'tool',
  inputs: [{ id: 'text', label: '文本', type: 'string', required: true }],
  outputs: [{ id: 'part1', label: '片段1', type: 'string' }],
  params: [
    { id: 'separator', label: '分隔符', type: 'text', default: '\n' },
    { id: 'outputCount', label: '输出数量', type: 'number', min: 2, max: 9, default: 2 },
  ],
  maxOutputs: 9,
  dynamicOutputs: { prefix: 'part', type: 'string', countDataKey: 'outputCount', min: 1, max: 9 },
  architect: { enabled: true, order: 17, defaults: { separator: '\n', outputCount: 2 } },
  supportsDisabledPassthrough: true,
};
