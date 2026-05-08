/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const GROUP_NODE = {
  type: 'group',
  version: 1,
  label: '节点组',
  icon: 'merge',
  color: '#8E8E93',
  category: 'group',
  inputs: [],
  outputs: [],
  params: [{ id: 'title', label: '组标题', type: 'text', default: '节点组' }],
  supportsDisabledPassthrough: false,
  executable: false,
};
