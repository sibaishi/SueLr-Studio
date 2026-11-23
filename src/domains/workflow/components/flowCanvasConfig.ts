import { SelectionOutputNode } from './SelectionOutputNode';
import FlowNode from './nodes/FlowNode';
import AiNode from './nodes/ai/Ai/AiNode';
import IoNode from './nodes/io/Io/IoNode';

export const FLOW_NODE_TYPES = {
  selectionOutput: SelectionOutputNode,
  group: FlowNode,
  ai: AiNode,
  io: IoNode,
} as const;

export const FLOW_NODE_COLORS: Record<string, string> = {
  group: '#8E8E93',
  ai: '#0A84FF',
  io: '#5E5CE6',
};

export const FLOW_DISABLED_NEW_NODE_TYPES = new Set<string>();
export const FLOW_FORCE_DISABLED_NODE_TYPES = new Set<string>();
