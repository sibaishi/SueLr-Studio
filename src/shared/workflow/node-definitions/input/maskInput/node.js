/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const MASK_INPUT_NODE = {
  type: 'maskInput',
  version: 1,
  label: '遮罩输入',
  icon: 'mask',
  color: '#7C4DFF',
  category: 'input',
  inputs: [],
  outputs: [{ id: 'mask', label: '遮罩', type: 'mask' }],
  params: [
    { id: 'fileUrl', label: '遮罩源文件', type: 'text', default: '' },
    { id: 'threshold', label: '阈值', type: 'slider', min: 0, max: 255, step: 1, default: 128 },
    { id: 'invertMask', label: '反相遮罩', type: 'toggle', default: false },
  ],
  architect: { enabled: true, order: 3, defaults: { fileUrl: '' } },
  agentInput: { aliases: ['maskinput', 'mask', '\u8499\u7248\u8f93\u5165', '\u8499\u7248'], adapter: 'mask' },
  supportsDisabledPassthrough: false,
};
