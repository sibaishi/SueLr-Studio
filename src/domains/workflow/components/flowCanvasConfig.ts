import FlowNode from './nodes/FlowNode';
import AiV3Node from './nodes/ai/AiV3/AiV3Node';
import IoNode from './nodes/io/Io/IoNode';

export const FLOW_NODE_TYPES = {
  group: FlowNode,
  aiV3: AiV3Node,
  io: IoNode,
} as const;

export const FLOW_NODE_COLORS: Record<string, string> = {
  group: '#8E8E93',
  aiV3: '#0A84FF',
  io: '#5E5CE6',
};

export const FLOW_DISABLED_NEW_NODE_TYPES = new Set<string>();
export const FLOW_FORCE_DISABLED_NODE_TYPES = new Set<string>();
export const FLOW_DISABLED_NODE_REASON = '暂时停用，无法新建';
