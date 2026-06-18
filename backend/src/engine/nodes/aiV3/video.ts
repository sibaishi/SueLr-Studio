import { executeVideoGeneration } from '../../../platform/ai/video-service.ts';
import { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';

export async function executeVideoMode(
  prompt: string,
  images: DynamicValue[],
  video: DynamicValue | undefined,
  audio: DynamicValue | undefined,
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const vConfig = { ...runtimeConfig, baseUrl: String(runtimeConfig.baseUrl || ''), abortSignal: apiConfig.abortSignal, persistGeneratedOutputs: false };
  if (!vConfig.apiKey) throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');
  const videoResult = await executeVideoGeneration(
    { model: String(runtimeConfig.model || nodeData.model || 'cogvideox'), prompt, reference: images, video, audio, duration: (nodeData.duration as number) || 5, aspect_ratio: String(nodeData.ratio || 'auto'), resolution: String(nodeData.resolution || '720p') },
    vConfig, sendProgress,
  );
  return { result: videoResult.video };
}
