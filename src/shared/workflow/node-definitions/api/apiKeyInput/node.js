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
    {
      id: 'endpointMode',
      label: '接口模式',
      type: 'select',
      default: 'category',
      options: [
        { label: '内置接口类型', value: 'category' },
        { label: '自定义路径', value: 'custom' },
      ],
    },
    {
      id: 'endpointCategory',
      label: '接口类型',
      type: 'select',
      default: 'chat',
      options: [
        { label: '对话接口', value: 'chat' },
        { label: '图像生成', value: 'image' },
        { label: '图像编辑', value: 'image-edit' },
        { label: 'Gemini generateContent', value: 'gemini-generate-content' },
        { label: '视频生成', value: 'video' },
      ],
    },
    { id: 'customEndpoint', label: '自定义路径', type: 'text', default: '' },
  ],
  supportsDisabledPassthrough: false,
};
