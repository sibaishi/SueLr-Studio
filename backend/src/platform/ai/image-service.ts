import { generateImages } from '../../engine/helpers/imageGeneration.js';

type ProgressHandler = (message: string) => void;

export async function runImageGeneration(
  request: Record<string, unknown>,
  runtimeConfig: Record<string, unknown>,
  sendProgress?: ProgressHandler,
): Promise<unknown> {
  return generateImages(request, runtimeConfig, sendProgress);
}
