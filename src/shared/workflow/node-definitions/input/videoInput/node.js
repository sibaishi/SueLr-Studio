/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const VIDEO_INPUT_NODE = {
  type: 'videoInput',
  version: 1,
  label: '视频输入',
  icon: 'film',
  color: '#AF52DE',
  category: 'input',
  inputs: [],
  outputs: [{ id: 'video', label: '视频', type: 'video' }],
  params: [{ id: 'fileUrl', label: '视频文件', type: 'text', default: '' }],
  architect: { enabled: true, order: 4, defaults: { fileUrl: '' } },
  agentInput: { aliases: ['videoinput', 'video', '\u89c6\u9891\u8f93\u5165', '\u89c6\u9891'], adapter: 'video' },
  supportsDisabledPassthrough: false,
};
