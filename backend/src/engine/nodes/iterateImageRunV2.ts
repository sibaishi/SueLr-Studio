import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  _node: WorkflowNode,
  inputs: NodeInputs,
  _apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  // Collect all image inputs
  const images: string[] = [];

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
      if (
        typeMeta?.inputType === 'image' ||
        typeMeta?.sourceType === 'imageInput' ||
        (typeMeta?.sourceType && typeMeta.sourceType.toLowerCase().includes('image'))
      ) {
        const collectUrls = (v: unknown) => {
          if (typeof v === 'string' && v.trim()) images.push(v.trim());
          else if (v && typeof v === 'object') {
            const obj = v as Record<string, unknown>;
            if (typeof obj.url === 'string' && obj.url.trim()) images.push(obj.url.trim());
            else if (typeof obj.src === 'string' && obj.src.trim()) images.push(obj.src.trim());
            else if (typeof obj.data === 'string' && obj.data.trim()) images.push(obj.data.trim());
          }
        };
        if (Array.isArray(value)) {
          for (const item of value) collectUrls(item);
        } else {
          collectUrls(value);
        }
      }
    }
  } else {
    // Fallback: try to extract URLs from values
    for (const [, value] of entries) {
      const collectUrls = (v: unknown) => {
        if (typeof v === 'string' && v.trim()) images.push(v.trim());
        else if (v && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          if (typeof obj.url === 'string' && obj.url.trim()) images.push(obj.url.trim());
          else if (typeof obj.src === 'string' && obj.src.trim()) images.push(obj.src.trim());
          else if (typeof obj.data === 'string' && obj.data.trim()) images.push(obj.data.trim());
        }
      };
      if (Array.isArray(value)) {
        for (const item of value) collectUrls(item);
      } else {
        collectUrls(value);
      }
    }
  }

  sendProgress?.(images.length > 0 ? `输出当前逐项图片 (共 ${images.length} 张)...` : '没有可用的逐项图片...');

  return { images };
}
