import { runImageGeneration } from '../../platform/ai/image-service.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

const MAX_IMAGES = 9;

function classifyBySourceType(
  sourceType: string,
): 'text' | 'image' | 'mask' | null {
  if (!sourceType) return null;
  const t = sourceType.toLowerCase();
  if (t === 'maskinput' || t.includes('mask')) return 'mask';
  if (t === 'videoinput' || t === 'videogen' || t === 'videomerge') return 'image'; // video frames → image reference
  if (t.includes('image') || t.includes('video')) return 'image';
  if (t.includes('text') || t.includes('chat') || t.includes('prompt') || t === 'savefile' || t === 'output' || t === 'iteraterun') return 'text';
  return null;
}

function classifyByValue(value: unknown): 'text' | 'image' | null {
  if (!value) return null;
  const str = String(value);
  if (str.startsWith('data:image/') || str.startsWith('data:video/')) return 'image';
  if (str.match(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|avif|bmp)(\?|$)/i)) return 'image';
  if (str.startsWith('http://') || str.startsWith('https://')) return 'image'; // likely a remote image URL
  if (/\/api\/files\//.test(str)) return 'image'; // internal file reference
  return 'text';
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const rawValues: unknown[] = Array.isArray(inputs.input)
    ? inputs.input
    : inputs.input !== undefined
      ? [inputs.input]
      : [];
  const sourceTypes: string[] =
    Array.isArray((inputs as Record<string, unknown>)._inputTypes)
      ? (inputs as Record<string, unknown>)._inputTypes as string[]
      : [];

  let prompt = '';
  const references: DynamicValue[] = [];
  let mask: DynamicValue | undefined;

  for (let i = 0; i < rawValues.length; i++) {
    const value = rawValues[i];
    let type = sourceTypes[i] ? classifyBySourceType(sourceTypes[i]) : null;
    if (!type) type = classifyByValue(value);
    if (!type) type = 'text';

    switch (type) {
      case 'text':
        prompt = prompt ? `${prompt}\n${String(value)}` : String(value);
        break;
      case 'image':
        if (references.length < MAX_IMAGES) {
          references.push(value as DynamicValue);
        }
        break;
      case 'mask':
        if (!mask) mask = value as DynamicValue;
        break;
    }
  }

  // Append textarea prompt after connected text inputs
  if (node.data?.prompt && String(node.data.prompt).trim()) {
    const extra = String(node.data.prompt).trim();
    prompt = prompt ? `${prompt}\n${extra}` : extra;
  }

  const runtimeConfig = resolveRuntimeApiConfig({}, apiConfig, node.data?.model);

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
