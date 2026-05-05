/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
/** @typedef {import('@/shared/workflow/types').ParamDef} ParamDef */

const RATIO_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
];

const VIDEO_DURATION_OPTIONS = [
  { label: '5秒', value: 5 },
  { label: '10秒', value: 10 },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
];

const VIDEO_RATIO_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

/** @type {ParamDef['options']} */
const EMPTY_OPTIONS = [];

/** @type {NodeTypeDef[]} */
export const WORKFLOW_NODE_REGISTRY = [
  {
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
  },
  {
    type: 'textInput',
    version: 1,
    label: '文本输入',
    icon: 'pen',
    color: '#007AFF',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'text', label: '文本', type: 'string' }],
    params: [{ id: 'text', label: '文本内容', type: 'textarea', default: '' }],
    supportsDisabledPassthrough: false,
  },
  {
    type: 'imageInput',
    version: 1,
    label: '图像输入',
    icon: 'image',
    color: '#FF9500',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'image', label: '图像', type: 'image' },
      { id: 'mask', label: '遮罩', type: 'mask' },
    ],
    params: [{ id: 'fileUrl', label: '图像文件', type: 'text', default: '' }],
    supportsDisabledPassthrough: false,
  },
  {
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
    supportsDisabledPassthrough: false,
  },
  {
    type: 'imageResize',
    version: 1,
    label: '图像缩放',
    icon: 'resize',
    color: '#FF9F0A',
    category: 'input',
    inputs: [{ id: 'image', label: '原图', type: 'image', required: true }],
    outputs: [{ id: 'image', label: '缩放后图像', type: 'image' }],
    params: [
      {
        id: 'resizeMode',
        label: '缩放模式',
        type: 'select',
        default: 'percent',
      options: [
          { label: '按百分比', value: 'percent' },
          { label: '按尺寸', value: 'dimensions' },
        ],
      },
      { id: 'scalePercent', label: '缩放比例（%）', type: 'number', min: 1, max: 1000, default: 100 },
      { id: 'targetWidth', label: '目标宽度', type: 'number', min: 1, default: 1024, group: 'resizeDimensions' },
      { id: 'targetHeight', label: '目标高度', type: 'number', min: 1, default: 1024, group: 'resizeDimensions' },
    ],
    supportsDisabledPassthrough: true,
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    type: 'textMerge',
    version: 1,
    label: '文本合并',
    icon: 'merge',
    color: '#007AFF',
    category: 'merge',
    inputs: [{ id: 'item', label: '文本', type: 'string', required: false, multiple: true }],
    outputs: [{ id: 'merged', label: '合并文本', type: 'string[]' }],
    params: [],
    maxInputs: 9,
    supportsDisabledPassthrough: true,
  },
  {
    type: 'imageMerge',
    version: 1,
    label: '图片合并',
    icon: 'merge',
    color: '#FF9500',
    category: 'merge',
    inputs: [{ id: 'item', label: '图片', type: 'image', required: false, multiple: true }],
    outputs: [{ id: 'merged', label: '合并图片', type: 'image[]' }],
    params: [],
    maxInputs: 9,
    supportsDisabledPassthrough: true,
  },
  {
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
  },
  {
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
    supportsDisabledPassthrough: true,
  },
  {
    type: 'universalMerge',
    version: 1,
    label: '通用合并',
    icon: 'merge',
    color: '#64D2FF',
    category: 'merge',
    inputs: [{ id: 'item', label: '素材', type: 'any', required: false, multiple: true }],
    outputs: [{ id: 'merged', label: '合并素材', type: 'any[]' }],
    params: [],
    maxInputs: 9,
    supportsDisabledPassthrough: true,
  },
  {
    type: 'aiChat',
    version: 1,
    label: 'AI 对话',
    icon: 'bot',
    color: '#30D158',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'image', label: '图像', type: 'image', required: false },
      { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
    ],
    outputs: [{ id: 'response', label: '回复', type: 'string' }],
    params: [
      { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '', group: 'aiChatTop' },
      { id: 'enableWebSearch', label: '联网搜索', type: 'toggle', default: false, group: 'aiChatTop' },
      { id: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
      { id: 'maxTokens', label: '最大 Token', type: 'number', min: 1, max: 32000, default: 4096 },
      { id: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '' },
    ],
    supportsDisabledPassthrough: true,
  },
  {
    type: 'imageGen',
    version: 1,
    label: '图像生成',
    icon: 'palette',
    color: '#FF9500',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'reference', label: '参考图片', type: 'image', required: false },
      { id: 'mask', label: '遮罩图', type: 'mask', required: false },
      { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
    ],
    outputs: [{ id: 'images', label: '生成图片', type: 'image[]' }],
    params: [
      { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
      { id: 'ratio', label: '图片比例', type: 'select', default: 'auto', options: RATIO_OPTIONS, group: 'ratioCount' },
      {
        id: 'quality',
        label: '质量',
        type: 'select',
        default: 'high',
        options: [
          { label: 'low', value: 'low' },
          { label: 'medium', value: 'medium' },
          { label: 'high', value: 'high' },
          { label: 'auto', value: 'auto' },
        ],
        group: 'qualityFormat',
      },
      { id: 'n', label: '张数', type: 'number', min: 1, max: 8, default: 1, group: 'ratioCount' },
      { id: 'width', label: '宽', type: 'number', min: 16, default: 0, group: 'widthHeight' },
      { id: 'height', label: '高', type: 'number', min: 16, default: 0, group: 'widthHeight' },
      {
        id: 'output_format',
        label: '格式',
        type: 'select',
        default: 'png',
        options: [
          { label: 'png', value: 'png' },
          { label: 'jpeg', value: 'jpeg' },
          { label: 'webp', value: 'webp' },
        ],
        group: 'qualityFormat',
      },
    ],
    supportsDisabledPassthrough: true,
  },
  {
    type: 'videoGen',
    version: 1,
    label: '视频生成',
    icon: 'clapperboard',
    color: '#AF52DE',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: '提示词', type: 'string', required: true },
      { id: 'reference', label: '参考图片', type: 'image', required: false },
      { id: 'video', label: '视频', type: 'video', required: false },
      { id: 'audio', label: '音频', type: 'audio', required: false },
      { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
    ],
    outputs: [{ id: 'video', label: '生成视频', type: 'video' }],
    params: [
      { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
      { id: 'duration', label: '时长（秒）', type: 'select', default: 5, options: VIDEO_DURATION_OPTIONS },
      { id: 'resolution', label: '分辨率', type: 'select', default: '720p', options: VIDEO_RESOLUTION_OPTIONS },
      { id: 'ratio', label: '比例', type: 'select', default: 'auto', options: VIDEO_RATIO_OPTIONS },
    ],
    supportsDisabledPassthrough: true,
  },
  {
    type: 'saveFile',
    version: 1,
    label: '保存文件',
    icon: 'save',
    color: '#34C759',
    category: 'output',
    inputs: [{ id: 'content', label: '内容', type: 'any', required: true }],
    outputs: [{ id: 'content', label: '原内容', type: 'any' }],
    params: [
      { id: 'outputPath', label: '保存路径（未设置则不保存）', type: 'text', default: '', picker: 'directory' },
      { id: 'filenamePrefix', label: '文件名前缀', type: 'text', default: 'saved' },
    ],
    supportsDisabledPassthrough: true,
  },
  {
    type: 'output',
    version: 1,
    label: '输出展示',
    icon: 'eye',
    color: '#8E8E93',
    category: 'output',
    inputs: [{ id: 'content', label: '内容', type: 'any', required: true }],
    outputs: [],
    params: [],
    supportsDisabledPassthrough: false,
  },
];

/** @type {Map<string, NodeTypeDef>} */
const NODE_REGISTRY_BY_TYPE = new Map(WORKFLOW_NODE_REGISTRY.map((node) => [node.type, node]));

/** @param {string} type */
export function getNodeDef(type) {
  return NODE_REGISTRY_BY_TYPE.get(type);
}

/** @param {string} type */
export function getNodeTypeLabel(type) {
  return getNodeDef(type)?.label || type || '未知节点';
}

export function getRegisteredNodeTypes() {
  return [...NODE_REGISTRY_BY_TYPE.keys()];
}

/** @param {string} type */
export function getRequiredInputs(type) {
  return (getNodeDef(type)?.inputs || []).filter((input) => input.required).map((input) => input.id);
}

/** @param {string} type */
export function getNodeDataDefaults(type) {
  const params = getNodeDef(type)?.params || [];
  return params.reduce((accumulator, param) => {
    if (param.default !== undefined) {
      accumulator[param.id] = param.default;
    }
    return accumulator;
  }, /** @type {Record<string, unknown>} */ ({}));
}

/** @param {string} type */
export function isExecutableNodeType(type) {
  const node = getNodeDef(type);
  return Boolean(node) && node.executable !== false;
}

/** @param {string} type */
export function supportsDisabledPassthrough(type) {
  return Boolean(getNodeDef(type)?.supportsDisabledPassthrough);
}
