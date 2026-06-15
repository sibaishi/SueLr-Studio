/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const IO_NODE = {
  type: 'io',
  version: 1,
  label: 'IO',
  icon: 'layers',
  color: '#5E5CE6',
  category: 'input',
  inputs: [
    { id: 'input', label: '输入', type: 'any', required: false },
  ],
  outputs: [{ id: 'result', label: '输出', type: 'any' }],
  params: [],
  architect: { enabled: true, order: 1, defaults: { text: '', content: [], _fileIds: [], _fileKinds: [] } },
  supportsDisabledPassthrough: true,
};
