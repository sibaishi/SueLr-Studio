import { collectMergedTextValues } from '../helpers/mergeItems.js';

export async function execute(node, inputs, apiConfig, onProgress) {
  void node;
  void apiConfig;
  onProgress('合并文本...');

  return { merged: collectMergedTextValues(inputs) };
}
