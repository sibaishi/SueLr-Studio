// biome-ignore lint/suspicious/noExplicitAny: Workflow node payloads are dynamic by design at the executor boundary.
export type DynamicValue = any;

export type NodeData = Record<string, DynamicValue>;

export type WorkflowNode = {
  data?: NodeData;
  id?: string;
  type?: string;
  [key: string]: DynamicValue;
};

export type NodeInputs = Record<string, DynamicValue>;

export type RuntimeApiConfig = Record<string, DynamicValue> & {
  abortSignal?: AbortSignal;
  runId?: string;
};

export type ProgressCallback = ((message: string, data?: Record<string, unknown>) => void) | undefined;
