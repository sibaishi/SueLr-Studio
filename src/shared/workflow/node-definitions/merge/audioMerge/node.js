/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const AUDIO_MERGE_NODE = {
  type: 'audioMerge',
  version: 1,
  label: '音频合并',
  icon: 'merge',
  color: '#FF375F',
  category: 'merge',
  inputs: [{ id: 'item', label: '音频', type: 'audio', required: false, multiple: true }],
  outputs: [{ id: 'merged', label: '合并音频', type: 'audio[]' }],
  params: [],
  maxInputs: 9,
  dynamicInputs: { prefix: 'item', type: 'audio', countDataKey: 'inputCount', min: 1, max: 9 },
  architect: { enabled: true, order: 10, defaults: { inputCount: 2 } },
  supportsDisabledPassthrough: true,
};
