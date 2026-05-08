/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const SAVE_FILE_NODE = {
  type: 'saveFile',
  version: 1,
  label: '保存文件',
  icon: 'save',
  color: '#34C759',
  category: 'output',
  inputs: [{ id: 'content', label: '内容', type: 'any', required: true }],
  outputs: [{ id: 'content', label: '原内容', type: 'any' }],
  params: [
    { id: 'outputPath', label: '保存路径（未设置则不保存）', type: 'text', default: '', picker: 'directory' },
    { id: 'filenamePrefix', label: '文件名前缀', type: 'text', default: 'saved' },
  ],
  supportsDisabledPassthrough: true,
};
