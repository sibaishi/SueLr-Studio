import type { getNodeDef } from '@/domains/workflow/lib/constants';
import type { ComponentType } from 'react';
import type { CSSProperties } from 'react';

export type NodeDef = ReturnType<typeof getNodeDef>;

export interface NodeContentProps {
  type: string;
  data: Record<string, unknown>;
  nodeId: string;
  def: NodeDef;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outputs?: Record<string, unknown>;
  showBottomBorder: boolean;
  connectedInputCount?: number;
  outerStyle: CSSProperties;
}

export type NodeContentRenderer = ComponentType<NodeContentProps>;

export interface NodeContentRenderProps {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}
