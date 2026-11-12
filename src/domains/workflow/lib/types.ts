export interface ModelInfo {
  id: string;
  cat: 'chat' | 'image' | 'video' | 'audio';
}

export type {
  ExecutionSnapshot,
  NodeExecutionStatus,
  NodeTypeDef,
  ParamDef,
  ParamType,
  PersistedWorkflow,
  PortDataType,
  PortDef,
  SSENodeComplete,
  SSENodeError,
  SSENodeProgress,
  SSENodeStart,
  SSEWorkflowComplete,
  SSEWorkflowError,
  ThemeMode,
  Workflow,
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowSettings,
} from '@/shared/workflow/types';
