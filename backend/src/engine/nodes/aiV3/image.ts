import { runImageGeneration } from '../../../platform/ai/image-service.ts';
import type { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';
import { dedupePreferUrl } from './helpers.ts';

export async function executeImageMode(
  prompt: string,
  images: DynamicValue[],
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const request = {
    model: runtimeConfig.model || nodeData.model || 'gpt-image-2',
    prompt,
    ratio: nodeData.ratio || 'auto',
    width: nodeData.width,
    height: nodeData.height,
    quality: nodeData.quality,
    resolution: nodeData.resolution,
    n: nodeData.n,
    output_format: nodeData.output_format,
    image: images.length > 0 ? images : undefined,
    mask: nodeData.mask,
  };

  const imgConfig = { ...runtimeConfig, abortSignal: apiConfig?.abortSignal, persistGeneratedOutputs: false };
  const result = (await runImageGeneration(request, imgConfig, sendProgress)) as {
    images: DynamicValue[];
    request?: { model?: DynamicValue };
  };

  const deduped = dedupePreferUrl(result.images);
  return { result: deduped, meta: { model: result.request?.model || request.model, count: deduped.length } };
}
