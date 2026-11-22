/** 生成结果的当次执行记录；不包含渠道凭证或供应商原始响应。 */
export interface GenerationReference {
  url: string;
  kind: 'image' | 'video' | 'audio';
  role?: 'reference' | 'mask';
}

export interface GenerationRecord {
  version: 1;
  runId: string;
  workflowId: string;
  nodeId: string;
  createdAt: number;
  prompt: string;
  references: GenerationReference[];
  parameters: Record<string, string | number | boolean>;
}

export const GENERATION_PARAMETER_KEYS = [
  'mode',
  'ratio',
  'width',
  'height',
  'quality',
  'imageResolution',
  'n',
  'output_format',
  'duration',
  'voice',
  'systemPrompt',
  'enableWebSearch',
  'mjVersion',
  'mjAr',
  'mjSeed',
  'mjStylize',
  'mjChaos',
  'mjNo',
  'mjMode',
] as const;
