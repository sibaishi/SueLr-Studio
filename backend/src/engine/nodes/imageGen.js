import { runImageGeneration } from '../../platform/ai/image-service.js';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.js';

export async function execute(node, inputs, apiConfig, sendProgress) {
  const runtimeConfig = resolveRuntimeApiConfig(inputs, apiConfig, node.data?.model);
  if (inputs.mask && !inputs.reference) {
    throw new Error('Image generation requires a reference image when mask is provided');
  }

  const request = {
    model: runtimeConfig.model || node.data?.model || 'gpt-image-2',
    prompt: inputs.prompt,
    ratio: node.data?.ratio || 'auto',
    width: node.data?.width,
    height: node.data?.height,
    quality: node.data?.quality,
    resolution: node.data?.resolution,
    n: node.data?.n,
    output_format: node.data?.output_format,
    image: inputs.reference,
    mask: inputs.mask || node.data?.mask,
  };

  const imageRuntimeConfig = {
    ...runtimeConfig,
    abortSignal: apiConfig?.abortSignal,
    persistGeneratedOutputs: false,
  };

  const result = await runImageGeneration(request, imageRuntimeConfig, sendProgress);
  sendProgress?.(`Image generation completed: ${result.images.length}`);

  return {
    images: result.images,
    meta: {
      model: result.request?.model || request.model,
      count: result.images.length,
    },
  };
}
