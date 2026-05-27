import { collectMergedMediaValues } from '../helpers/mergeItems.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  void node;
  void apiConfig;
  onProgress?.('合并视频...');

  return { merged: collectMergedMediaValues(inputs) };
}
