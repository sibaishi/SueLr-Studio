/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const TEXT_CLEAN_NODE = {
  type: 'textClean',
  version: 1,
  label: '文本清理',
  icon: 'eraser',
  color: '#007AFF',
  category: 'merge',
  inputs: [{ id: 'text', label: '文本', type: 'string', required: true }],
  outputs: [{ id: 'text', label: '清理后文本', type: 'string' }],
  params: [
    { id: 'startToken', label: '开始关键词', type: 'text', default: '<think>', group: 'rangeTokens' },
    { id: 'endToken', label: '结束关键词', type: 'text', default: '</think>', group: 'rangeTokens' },
    { id: 'removeStartToken', label: '删除开始关键词', type: 'toggle', default: true, group: 'rangeOptions' },
    { id: 'removeEndToken', label: '删除结束关键词', type: 'toggle', default: true, group: 'rangeOptions' },
    { id: 'removeAllRanges', label: '删除所有匹配区间', type: 'toggle', default: true, group: 'rangeOptions' },
  ],
  supportsDisabledPassthrough: true,
};
