export interface ModelInfo {
  id: string;
  cat: 'chat' | 'image' | 'video';
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
