import FlowNode from './nodes/FlowNode';

export const FLOW_NODE_TYPES = {
  group: FlowNode,
  textInput: FlowNode,
  imageInput: FlowNode,
  maskInput: FlowNode,
  imageResize: FlowNode,
  videoInput: FlowNode,
  audioInput: FlowNode,
  apiKeyInput: FlowNode,
  iterateRun: FlowNode,
  textClean: FlowNode,
  textSplit: FlowNode,
  textMerge: FlowNode,
  imageMerge: FlowNode,
  videoMerge: FlowNode,
  audioMerge: FlowNode,
  universalMerge: FlowNode,
  aiChat: FlowNode,
  imageGen: FlowNode,
  videoGen: FlowNode,
  saveFile: FlowNode,
  output: FlowNode,
} as const;

export const FLOW_NODE_COLORS: Record<string, string> = {
  group: '#8E8E93',
  textInput: '#007AFF',
  imageInput: '#FF9500',
  maskInput: '#7C4DFF',
  imageResize: '#FF9F0A',
  videoInput: '#AF52DE',
  audioInput: '#FF375F',
  apiKeyInput: '#5856D6',
  iterateRun: '#007AFF',
  textClean: '#007AFF',
  textSplit: '#0A84FF',
  textMerge: '#007AFF',
  imageMerge: '#FF9500',
  videoMerge: '#AF52DE',
  audioMerge: '#FF375F',
  universalMerge: '#64D2FF',
  aiChat: '#30D158',
  imageGen: '#FF9500',
  videoGen: '#AF52DE',
  saveFile: '#34C759',
  output: '#8E8E93',
};

export const FLOW_CATEGORY_LABELS = {
  group: '节点组',
  input: '输入',
  api: 'API',
  merge: '工具',
  ai: 'AI 能力',
  output: '输出',
} as const;

export const FLOW_CATEGORY_ORDER = ['input', 'api', 'merge', 'ai', 'output', 'group'] as const;
export const FLOW_DISABLED_NEW_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge', 'universalMerge']);
export const FLOW_FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);
export const FLOW_DISABLED_NODE_REASON = '暂时停用，无法新建';
