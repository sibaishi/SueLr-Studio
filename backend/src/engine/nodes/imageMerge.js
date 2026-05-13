import { collectMergedMediaValues } from '../helpers/mergeItems.js';

export async function execute(node, inputs, apiConfig, onProgress) {
  void node;
  void apiConfig;
  onProgress('合并图片...');

  return { merged: collectMergedMediaValues(inputs) };
}
