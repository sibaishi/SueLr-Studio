/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */

/** @type {NodeTypeDef} */
export const API_KEY_INPUT_NODE = {
  type: 'apiKeyInput',
  version: 1,
  label: 'API Key',
  icon: 'key',
  color: '#5856D6',
  category: 'api',
  inputs: [],
  outputs: [{ id: 'apiKey', label: 'API 配置', type: 'apiKey' }],
  params: [
    { id: 'apiKey', label: 'API Key', type: 'text', default: '' },
    { id: 'baseUrl', label: 'Base URL（可选）', type: 'text', default: '' },
    { id: 'selectedModel', label: '模型', type: 'text', default: '' },
    { id: 'endpoint', label: '接口路径', type: 'text', default: '' },
  ],
  supportsDisabledPassthrough: false,
};
