import FlowNode from './nodes/FlowNode';
import AiV3Node from './nodes/ai/AiV3/AiV3Node';
import IoNode from './nodes/io/Io/IoNode';

export const FLOW_NODE_TYPES = {
  group: FlowNode,
  imageSplit: FlowNode,
  imageCompare: FlowNode,
  iterateRun: FlowNode,
  iterateImageRun: FlowNode,
  promptHelper: FlowNode,
  textClean: FlowNode,
  textSplit: FlowNode,
  aiV3: AiV3Node,
  io: IoNode,
} as const;

export const FLOW_NODE_COLORS: Record<string, string> = {
  group: '#8E8E93',
  imageSplit: '#FF9500',
  imageCompare: '#FF9500',
  iterateRun: '#007AFF',
  iterateImageRun: '#FF9500',
  promptHelper: '#00C7BE',
  textClean: '#007AFF',
  textSplit: '#0A84FF',
  aiV3: '#0A84FF',
  io: '#5E5CE6',
};

export const FLOW_CATEGORY_LABELS = {
  group: '节点组',
  input: '输入',
  iterate: '逐项运行',
  tool: '工具',
  ai: 'AI 能力',
} as const;

export const FLOW_CATEGORY_ORDER = ['input', 'iterate', 'tool', 'ai', 'group'] as const;
export const FLOW_DISABLED_NEW_NODE_TYPES = new Set<string>();
export const FLOW_FORCE_DISABLED_NODE_TYPES = new Set<string>();
export const FLOW_DISABLED_NODE_REASON = '暂时停用，无法新建';
