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
  tavilyApiKey?: string;
};

export type ProgressCallback = ((message: string) => void) | undefined;
