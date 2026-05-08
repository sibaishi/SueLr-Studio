/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const AUDIO_INPUT_NODE = {
  type: 'audioInput',
  version: 1,
  label: '音频输入',
  icon: 'music',
  color: '#FF375F',
  category: 'input',
  inputs: [],
  outputs: [{ id: 'audio', label: '音频', type: 'audio' }],
  params: [{ id: 'fileUrl', label: '音频文件', type: 'text', default: '' }],
  supportsDisabledPassthrough: false,
};
