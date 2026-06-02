export type WorkflowValidationPortDef = {
  type: string;
  required?: boolean;
};

export type WorkflowValidationDynamicPortDef = {
  prefix: string;
  type: string;
  countDataKey?: string;
  countDataKeys?: string[];
  countOperation?: 'multiply';
  min: number;
  max: number;
};

export type WorkflowValidationNodePortDef = {
  inputs: Record<string, WorkflowValidationPortDef>;
  outputs: Record<string, WorkflowValidationPortDef>;
  dynamicInputs?: WorkflowValidationDynamicPortDef & { countDataKey: string };
  dynamicOutputs?: WorkflowValidationDynamicPortDef;
  dynamicOutputInputs?: WorkflowValidationDynamicPortDef;
};

export function getWorkflowValidationNodePortDef(type: string): WorkflowValidationNodePortDef | undefined;
export function getWorkflowValidationNodePortDefs(): Record<string, WorkflowValidationNodePortDef>;
export function getWorkflowArchitectNodeTypes(): string[];
export function getWorkflowArchitectDefaultData(type: string): Record<string, unknown>;
export function getWorkflowArchitectVariableInputNodeTypes(): string[];
export function getWorkflowArchitectVariableOutputNodeTypes(): string[];
export function getWorkflowValidationInputNodeTypes(): string[];
export function getWorkflowAgentInputNodeDefs(): Array<{
  type: string;
  aliases: string[];
  adapter: 'text' | 'image' | 'video' | 'audio' | 'mask';
}>;
