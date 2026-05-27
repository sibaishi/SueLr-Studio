import { executeVideoGeneration } from '../../platform/ai/video-service.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const runtimeConfig = resolveRuntimeApiConfig(inputs, apiConfig, node.data?.model);
  const videoRuntimeConfig = {
    ...runtimeConfig,
    baseUrl: String(runtimeConfig.baseUrl || ''),
    abortSignal: apiConfig.abortSignal,
    persistGeneratedOutputs: false,
  };
  const { apiKey } = runtimeConfig;

  if (!apiKey) {
    throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');
  }

  return executeVideoGeneration(
    {
      model: runtimeConfig.model || node.data?.model || 'cogvideox',
      prompt: inputs.prompt,
      reference: inputs.reference,
      video: inputs.video,
      audio: inputs.audio,
      duration: node.data?.duration || 5,
      aspect_ratio: node.data?.ratio || 'auto',
      resolution: node.data?.resolution || '720p',
    },
    videoRuntimeConfig,
    sendProgress,
  );
}
