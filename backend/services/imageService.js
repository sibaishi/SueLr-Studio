import { generateImages } from '../engine/helpers/imageGeneration.js';

export async function runImageGeneration(request, runtimeConfig, sendProgress) {
  return generateImages(request, runtimeConfig, sendProgress);
}
