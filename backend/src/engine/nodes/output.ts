import { materializeContentForOutput } from '../helpers/saveHelper.js';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.js';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  _apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const content = inputs.content || null;
  if (content !== null) sendProgress?.('正在整理输出展示内容...');

  if (content === null) {
    return {
      content,
      savedFiles: [],
      savedPaths: [],
    };
  }

  sendProgress?.('正在自动保存输出内容...');
  return materializeContentForOutput(content, {
    prefix: 'output',
  });
}
