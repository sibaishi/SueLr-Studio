import { collectMergedMediaValues } from '../helpers/mergeItems.js';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.js';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  void node;
  void apiConfig;
  onProgress?.('合并音频...');

  return { merged: collectMergedMediaValues(inputs) };
}
