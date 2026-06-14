import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  _node: WorkflowNode,
  inputs: NodeInputs,
  _apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  // Collect all text inputs
  const texts: string[] = [];

  const inputTypes = (inputs as Record<string, unknown>)._inputTypes as
    | { sourceType?: string; inputType?: string }[]
    | undefined;

  const entries = Object.entries(inputs || {}).filter(
    ([key]) => !key.startsWith('_')
  );

  if (inputTypes && inputTypes.length > 0) {
    for (let i = 0; i < entries.length; i++) {
      const [, value] = entries[i];
      const typeMeta = inputTypes[i];
      if (typeMeta?.inputType === 'text' || typeMeta?.sourceType === 'textInput') {
        if (Array.isArray(value)) {
          for (const v of value) if (String(v ?? '').trim()) texts.push(String(v).trim());
        } else if (String(value ?? '').trim()) {
          texts.push(String(value).trim());
        }
      }
    }
  } else {
    // Fallback: collect all non-empty string values
    for (const [, value] of entries) {
      if (Array.isArray(value)) {
        for (const v of value) if (String(v ?? '').trim()) texts.push(String(v).trim());
      } else if (String(value ?? '').trim()) {
        texts.push(String(value).trim());
      }
    }
  }

  const text = texts[0] || '';
  sendProgress?.(text ? '输出当前逐项文本...' : '没有可用的逐项文本...');

  return { text };
}
