import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.js';
// ============================================================
// Flow Studio - 文本输入节点执行器
// ============================================================

/**
 * 执行文本输入节点
 * 当连接了上游文本时，优先返回上游文本；否则返回节点中存储的文本内容。
 */
export async function execute(node: WorkflowNode, inputs: NodeInputs) {
  const upstreamText = String(inputs?.input ?? inputs?.text ?? '').trim();
  const text = upstreamText || node.data?.text || '';
  return { text };
}
