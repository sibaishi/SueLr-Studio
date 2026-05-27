import { buildPromptHelperPrompt } from '../../../../src/shared/workflow/prompt-helper.js';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  void apiConfig;
  onProgress?.('生成辅助提示词...');
  return { prompt: buildPromptHelperPrompt(node?.data || {}, inputs || {}) };
}
