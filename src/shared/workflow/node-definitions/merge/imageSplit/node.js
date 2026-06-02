/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IMAGE_SPLIT_NODE = {
  type: 'imageSplit',
  version: 1,
  label: '图片拆分',
  icon: 'split',
  color: '#FF9500',
  category: 'tool',
  inputs: [{ id: 'image', label: '图片', type: 'image', required: true }],
  outputs: [{ id: 'part1', label: '图片1', type: 'image' }],
  params: [
    {
      id: 'rows',
      label: '行数',
      type: 'select',
      default: 3,
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
    {
      id: 'columns',
      label: '列数',
      type: 'select',
      default: 3,
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
  ],
  maxOutputs: 9,
  dynamicOutputs: {
    prefix: 'part',
    type: 'image',
    countDataKeys: ['rows', 'columns'],
    countOperation: 'multiply',
    min: 1,
    max: 9,
  },
  architect: {
    enabled: true,
    order: 13.5,
    defaults: { rows: 3, columns: 3 },
  },
  supportsDisabledPassthrough: true,
};
