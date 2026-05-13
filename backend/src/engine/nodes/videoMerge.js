import { collectMergedMediaValues } from '../helpers/mergeItems.js';

export async function execute(node, inputs, apiConfig, onProgress) {
  void node;
  void apiConfig;
  onProgress('合并视频...');

  return { merged: collectMergedMediaValues(inputs) };
}
