/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const MATERIAL_PROCESS_NODE = {
  type: 'materialProcess',
  version: 1,
  label: '素材处理',
  icon: 'repeat',
  color: '#AF52DE',
  category: 'tool',
  inputs: [{ id: 'input', label: '素材', type: 'any', required: true }],
  outputs: [{ id: 'result', label: '结果', type: 'any' }],
  params: [
    {
      id: 'materialType',
      label: '素材类型',
      type: 'select',
      default: 'auto',
      options: [
        { label: '自动识别', value: 'auto' },
        { label: '文本', value: 'text' },
        { label: '图像', value: 'image' },
      ],
    },
    { id: 'splitEnabled', label: '启用拆分', type: 'toggle', default: true },
    { id: 'iterateEnabled', label: '启用逐项', type: 'toggle', default: false },
    { id: 'separator', label: '文本分隔符', type: 'text', default: '\n', group: 'text' },
    { id: 'outputCount', label: '文本输出上限', type: 'number', min: 1, max: 9, default: 2, group: 'text' },
    {
      id: 'rows',
      label: '图像行数',
      type: 'select',
      default: 3,
      group: 'image',
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
    {
      id: 'columns',
      label: '图像列数',
      type: 'select',
      default: 3,
      group: 'image',
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
  ],
  architect: {
    enabled: true,
    order: 12,
    defaults: {
      materialType: 'auto',
      splitEnabled: true,
      iterateEnabled: false,
      separator: '\n',
      outputCount: 2,
      rows: 3,
      columns: 3,
    },
  },
  runtime: { mode: 'material-process' },
  supportsDisabledPassthrough: true,
};
