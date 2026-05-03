export type PortDataType =
  | 'string'
  | 'string[]'
  | 'image'
  | 'image[]'
  | 'mask'
  | 'video'
  | 'video[]'
  | 'audio'
  | 'audio[]'
  | 'apiKey'
  | 'any'
  | 'any[]';

export interface PortDef {
  id: string;
  label: string;
  type: PortDataType;
  required?: boolean;
  default?: unknown;
  multiple?: boolean;
}

export type ParamType = 'text' | 'textarea' | 'select' | 'number' | 'slider' | 'toggle';

export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  default?: unknown;
  group?: string;
  options?: { label: string; value: unknown }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface NodeTypeDef {
  type: string;
  version: number;
  label: string;
  icon: string;
  color: string;
  category: 'input' | 'api' | 'merge' | 'ai' | 'output' | 'group';
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
  maxInputs?: number;
  supportsDisabledPassthrough?: boolean;
  executable?: boolean;
}

export interface WorkflowNodeData {
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: string;
  version?: number;
  position: { x: number; y: number };
  data: WorkflowNodeData;
  ui?: {
    width?: number;
    height?: number;
    parentId?: string;
    extent?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface WorkflowSettings {
  apiConfigId?: string;
  providerConfig?: {
    authType?: string;
  };
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

export interface PersistedWorkflow extends Workflow {}

export interface WorkflowDraft {
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ExecutionSnapshot {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  snapshotVersion: number;
  source: 'persisted' | 'draft';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  createdAt: number;
}

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface SSENodeStart {
  nodeId: string;
  nodeType: string;
  index: number;
  total: number;
}

export interface SSENodeProgress {
  nodeId: string;
  progress: number;
  message: string;
}

export interface SSENodeComplete {
  nodeId: string;
  outputs: Record<string, unknown>;
  duration: number;
}

export interface SSENodeError {
  nodeId: string;
  error: string;
}

export interface SSEWorkflowComplete {
  totalDuration: number;
  successCount: number;
  failCount: number;
}

export interface SSEWorkflowError {
  error: string;
}

export type ThemeMode = 'light' | 'dark';
