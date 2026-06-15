import FlowNode from './nodes/FlowNode';
import AiChatV2Node from './nodes/ai/AiChatV2/AiChatV2Node';
import AiV3Node from './nodes/ai/AiV3/AiV3Node';
import ImageGenV2Node from './nodes/ai/ImageGenV2/ImageGenV2Node';
import IterateImageRunV2Node from './nodes/ai/IterateImageRunV2/IterateImageRunV2Node';
import IterateRunV2Node from './nodes/ai/IterateRunV2/IterateRunV2Node';
import VideoGenV2Node from './nodes/ai/VideoGenV2/VideoGenV2Node';

export const FLOW_NODE_TYPES = {
  group: FlowNode,
  textInput: FlowNode,
  imageInput: FlowNode,
  maskInput: FlowNode,
  imageResize: FlowNode,
  imageSplit: FlowNode,
  imageCompare: FlowNode,
  videoInput: FlowNode,
  audioInput: FlowNode,
  apiKeyInput: FlowNode,
  iterateRun: FlowNode,
  iterateRunV2: IterateRunV2Node,
  iterateImageRun: FlowNode,
  iterateImageRunV2: IterateImageRunV2Node,
  promptHelper: FlowNode,
  textClean: FlowNode,
  textSplit: FlowNode,
  textMerge: FlowNode,
  imageMerge: FlowNode,
  videoMerge: FlowNode,
  audioMerge: FlowNode,
  aiChat: FlowNode,
  imageGen: FlowNode,
  imageGenV2: ImageGenV2Node,
  videoGenV2: VideoGenV2Node,
  aiChatV2: AiChatV2Node,
  aiV3: AiV3Node,
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
  imageSplit: '#FF9500',
  imageCompare: '#FF9500',
  videoInput: '#AF52DE',
  audioInput: '#FF375F',
  apiKeyInput: '#5856D6',
  iterateRun: '#007AFF',
  iterateRunV2: '#007AFF',
  iterateImageRun: '#FF9500',
  iterateImageRunV2: '#FF9500',
  promptHelper: '#00C7BE',
  textClean: '#007AFF',
  textSplit: '#0A84FF',
  textMerge: '#007AFF',
  imageMerge: '#FF9500',
  videoMerge: '#AF52DE',
  audioMerge: '#FF375F',
  aiChat: '#30D158',
  imageGen: '#FF9500',
  imageGenV2: '#FF9500',
  videoGenV2: '#AF52DE',
  aiChatV2: '#30D158',
  aiV3: '#0A84FF',
  videoGen: '#AF52DE',
  saveFile: '#34C759',
  output: '#8E8E93',
};

export const FLOW_CATEGORY_LABELS = {
  group: '节点组',
  input: '输入',
  api: 'API',
  merge: '合并',
  iterate: '逐项运行',
  tool: '工具',
  ai: 'AI 能力',
  output: '输出',
} as const;

export const FLOW_CATEGORY_ORDER = ['input', 'api', 'merge', 'iterate', 'tool', 'ai', 'output', 'group'] as const;
export const FLOW_DISABLED_NEW_NODE_TYPES = new Set<string>();
export const FLOW_FORCE_DISABLED_NODE_TYPES = new Set<string>();
export const FLOW_DISABLED_NODE_REASON = '暂时停用，无法新建';
