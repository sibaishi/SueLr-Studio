import { executeMidjourneyImagine, type MidjourneyMode } from '../../../platform/ai/midjourney-service.ts';
import { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import { fetchImageBuffer, persistImageBuffer } from '../../helpers/downloadRemoteImageFile.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';

export async function executeMidjourneyMode(
  prompt: string,
  _images: DynamicValue[],
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const model = String(runtimeConfig.model || nodeData.model || 'Midjourney').trim();
  const basePrompt = [prompt, String(nodeData.prompt || '').trim()].filter(Boolean).join('\n');

  // 参数拼接到 prompt 末尾，Midjourney 靠 --param value 语法控制
  const paramParts: string[] = [];
  if (nodeData.mjVersion) paramParts.push(`--v ${nodeData.mjVersion}`);
  if (nodeData.mjAr && nodeData.mjAr !== '1:1') paramParts.push(`--ar ${nodeData.mjAr}`);
  if (nodeData.mjSeed != null && nodeData.mjSeed !== '') paramParts.push(`--seed ${nodeData.mjSeed}`);
  if (nodeData.mjStylize != null && nodeData.mjStylize !== '') paramParts.push(`--stylize ${nodeData.mjStylize}`);
  if (nodeData.mjChaos != null && nodeData.mjChaos !== '') paramParts.push(`--chaos ${nodeData.mjChaos}`);
  if (nodeData.mjNo) paramParts.push(`--no ${nodeData.mjNo}`);

  const midjourneyPrompt = [basePrompt, ...paramParts].filter(Boolean).join(' ');

  const result = await executeMidjourneyImagine(
    {
      model,
      prompt: midjourneyPrompt,
      mode: nodeData.mjMode as MidjourneyMode | undefined,
    },
    {
      apiKey: String(runtimeConfig.apiKey || ''),
      baseUrl: String(runtimeConfig.baseUrl || ''),
      providerConfig: runtimeConfig.providerConfig,
      projectModels: runtimeConfig.projectModels,
      abortSignal: apiConfig.abortSignal,
      scope: apiConfig.scope,
    },
    sendProgress,
  );

  // Download all images, dedup by content fingerprint
  const dedupFingerprints = new Map<string, string>();
  const workflowImages: string[] = [];

  async function downloadUnique(image: string): Promise<string> {
    const fetched = await fetchImageBuffer(image, apiConfig.scope!, apiConfig.abortSignal, sendProgress);
    const fingerprint = `${fetched.buffer.byteLength}:${fetched.buffer.slice(0, 64).toString('hex')}`;
    if (dedupFingerprints.has(fingerprint)) {
      sendProgress?.('跳过重复图片');
      return dedupFingerprints.get(fingerprint)!;
    }
    const localPath = persistImageBuffer(fetched.buffer, fetched.mimeType, apiConfig.scope!);
    dedupFingerprints.set(fingerprint, localPath);
    return localPath;
  }

  for (const image of result.images) {
    try {
      workflowImages.push(await downloadUnique(image));
    } catch (error) {
      sendProgress?.(`下载 Midjourney 图片失败，已跳过: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    result: workflowImages,
    meta: {
      model,
      count: workflowImages.length,
      task: result.task,
    },
  };
}
