/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const VIDEO_MERGE_NODE = {
  type: 'videoMerge',
  version: 1,
  label: '视频合并',
  icon: 'merge',
  color: '#AF52DE',
  category: 'merge',
  inputs: [{ id: 'item', label: '视频', type: 'video', required: false, multiple: true }],
  outputs: [{ id: 'merged', label: '合并视频', type: 'video[]' }],
  params: [],
  maxInputs: 9,
  supportsDisabledPassthrough: true,
};
