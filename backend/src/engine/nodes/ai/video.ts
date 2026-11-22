import { type VideoResultTask, executeVideoGeneration } from '../../../platform/ai/video-service.ts';
import type { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';
import { recordGenerationResult } from './generation-record.ts';

export async function executeVideoMode(
  prompt: string,
  images: DynamicValue[],
  video: DynamicValue | undefined,
  audio: DynamicValue | undefined,
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
  nodeId: string,
) {
  const vConfig = {
    ...runtimeConfig,
    baseUrl: String(runtimeConfig.baseUrl || ''),
    abortSignal: apiConfig.abortSignal,
    scope: apiConfig.scope,
    persistGeneratedOutputs: false,
    onDownloadFailed: (task: VideoResultTask) =>
      apiConfig.recordVideoRecovery?.({
        ...task,
        nodeId,
        model: String(nodeData.model || ''),
        configId: runtimeConfig.configId,
      }),
  };
  if (!vConfig.apiKey) throw new Error('未配置 API Key，请在工作室设置的「连接」中填写。');
  const videoResult = await executeVideoGeneration(
    {
      model: String(runtimeConfig.model || nodeData.model || 'cogvideox'),
      prompt,
      reference: images,
      video,
      audio,
      duration: (nodeData.duration as number) || 5,
      aspect_ratio: String(nodeData.ratio || 'auto'),
    },
    vConfig,
    sendProgress,
  );
  return recordGenerationResult(
    { result: videoResult.video },
    {
      mode: 'video',
      model: runtimeConfig.model || nodeData.model || 'cogvideox',
      prompt,
      duration: nodeData.duration || 5,
      ratio: nodeData.ratio || 'auto',
    },
    [
      ...images.map((url) => ({ url: String(url), kind: 'image' as const })),
      ...(typeof video === 'string' ? [{ url: video, kind: 'video' as const }] : []),
      ...(typeof audio === 'string' ? [{ url: audio, kind: 'audio' as const }] : []),
    ],
    nodeData,
    apiConfig,
  );
}
