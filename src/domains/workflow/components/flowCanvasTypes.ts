import type { Node as FlowNodeType } from '@xyflow/react';

export type ClipboardSnapshot = {
  nodes: FlowNodeType[];
  edges: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }[];
  bounds: {
    minX: number;
    minY: number;
  };
};

export type PendingConnection =
  | {
      allowCreateNode: boolean;
      handleType: 'source';
      sourceId: string;
      sourceHandle: string;
      sourceType: string;
    }
  | {
      allowCreateNode: boolean;
      handleType: 'target';
      targetId: string;
      targetHandle: string;
      targetType: string;
    };

export type ContextMenuKind = 'pane' | 'paneActions' | 'node' | 'connect';
export type MenuHorizontalDirection = 'left' | 'right';
export type EdgeInsertionCandidate = {
  edgeId: string;
  node: FlowNodeType;
};

export type ContextMenuState = {
  kind: ContextMenuKind;
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  horizontalDirection: MenuHorizontalDirection;
  nodeId?: string;
  selectedNodeIds?: string[];
  sourceConnection?: PendingConnection;
};
