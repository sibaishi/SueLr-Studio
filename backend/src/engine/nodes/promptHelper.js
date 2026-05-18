import { buildPromptHelperPrompt } from '../../../../src/shared/workflow/prompt-helper.js';

export async function execute(node, inputs, apiConfig, onProgress) {
  void apiConfig;
  onProgress('生成辅助提示词...');
  return { prompt: buildPromptHelperPrompt(node?.data || {}, inputs || {}) };
}
