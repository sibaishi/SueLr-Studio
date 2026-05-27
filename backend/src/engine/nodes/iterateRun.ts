import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';
function getInputIndex(key: string) {
  const match = String(key || '').match(/^item(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export async function execute(
  _node: WorkflowNode,
  inputs: NodeInputs,
  _apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const entries = Object.entries(inputs || {})
    .sort(([keyA], [keyB]) => getInputIndex(keyA) - getInputIndex(keyB))
    .map(([, value]) => String(value ?? '').trim())
    .filter((value) => value.length > 0);

  const text = entries[0] || '';
  sendProgress?.(text ? '输出当前逐项文本...' : '没有可用的逐项文本...');

  return { text };
}
