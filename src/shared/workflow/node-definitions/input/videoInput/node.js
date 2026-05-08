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
  supportsDisabledPassthrough: false,
};
