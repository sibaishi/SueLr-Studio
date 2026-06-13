import { runImageGeneration } from '../../platform/ai/image-service.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

function classifyValue(value: unknown): 'image' | 'mask' | 'apiKey' | 'text' {
  if (!value) return 'text';
  const str = String(value);
  if (str.startsWith('data:image/') || /\bapi\/files\b/i.test(str) || /\bapi\/outputs\b/i.test(str)) {
    // Check if it's a mask or regular image based on context
    // For now, all image-like values are treated as images
    return 'image';
  }
  if (/^sk-|^key-|^\$/.test(str)) return 'apiKey';
  return 'text';
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  // Collect all input values — may be single value or array from multi-input handle
  const rawValues: unknown[] = Array.isArray(inputs.input) ? inputs.input : inputs.input !== undefined ? [inputs.input] : [];
  
  let prompt = '';
  const references: DynamicValue[] = [];
  let mask: DynamicValue | undefined;
  let apiKey: DynamicValue | undefined;

  for (const value of rawValues) {
    const type = classifyValue(value);
    switch (type) {
      case 'text':
        prompt = prompt ? `${prompt}\n${String(value)}` : String(value);
        break;
      case 'image':
        references.push(value as DynamicValue);
        break;
      case 'mask':
        if (!mask) mask = value as DynamicValue;
        break;
      case 'apiKey':
        if (!apiKey) apiKey = value as DynamicValue;
        break;
    }
  }

  // Append textarea prompt after connected text inputs
  if (node.data?.prompt && String(node.data.prompt).trim()) {
    const extra = String(node.data.prompt).trim();
    prompt = prompt ? `${prompt}\n${extra}` : extra;
  }

  const runtimeConfig = resolveRuntimeApiConfig({ apiKey }, apiConfig, node.data?.model);

  if (mask && references.length === 0) {
    throw new Error('Image generation requires a reference image when mask is provided');
  }

  const request = {
    model: runtimeConfig.model || node.data?.model || 'gpt-image-2',
    prompt,
    ratio: node.data?.ratio || 'auto',
    width: node.data?.width,
    height: node.data?.height,
    quality: node.data?.quality,
    resolution: node.data?.resolution,
    n: node.data?.n,
    output_format: node.data?.output_format,
    image: references.length > 0 ? references : undefined,
    mask: mask || node.data?.mask,
  };

  const imageRuntimeConfig = {
    ...runtimeConfig,
    abortSignal: apiConfig?.abortSignal,
    persistGeneratedOutputs: false,
  };

  const result = (await runImageGeneration(request, imageRuntimeConfig, sendProgress)) as {
    images: DynamicValue[];
    request?: { model?: DynamicValue };
  };
  sendProgress?.(`Image generation completed: ${result.images.length}`);

  return {
    images: result.images,
    meta: {
      model: result.request?.model || request.model,
      count: result.images.length,
    },
  };
}
