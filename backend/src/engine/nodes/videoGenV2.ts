import { executeVideoGeneration } from '../../platform/ai/video-service.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

function classifyBySourceType(sourceType: string): 'text' | 'image' | 'video' | 'audio' | null {
  if (!sourceType) return null;
  const t = sourceType.toLowerCase();
  if (t.includes('image') || t === 'imageinput') return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  if (t.includes('text') || t.includes('chat') || t.includes('prompt') || t === 'savefile' || t === 'output' || t === 'iteraterun') return 'text';
  return null;
}

function classifyByValue(value: unknown): 'text' | 'image' | 'video' | 'audio' | null {
  if (!value) return null;
  const str = String(value);
  if (str.startsWith('data:video/')) return 'video';
  if (str.startsWith('data:audio/')) return 'audio';
  if (str.startsWith('data:image/')) return 'image';
  if (/^https?:\/\/.+\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(str)) return 'video';
  if (/^https?:\/\/.+\.(mp3|wav|ogg|aac|flac)(\?|$)/i.test(str)) return 'audio';
  if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(str)) return 'image';
  if (str.startsWith('http://') || str.startsWith('https://')) return 'image';
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
  let reference: DynamicValue | undefined;
  let video: DynamicValue | undefined;
  let audio: DynamicValue | undefined;

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
        if (!reference) reference = value as DynamicValue;
        break;
      case 'video':
        if (!video) video = value as DynamicValue;
        break;
      case 'audio':
        if (!audio) audio = value as DynamicValue;
        break;
    }
  }

  if (node.data?.prompt && String(node.data.prompt).trim()) {
    const extra = String(node.data.prompt).trim();
    prompt = prompt ? `${prompt}\n${extra}` : extra;
  }

  const runtimeConfig = resolveRuntimeApiConfig({}, apiConfig, node.data?.model);
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
      prompt,
      reference,
      video,
      audio,
      duration: node.data?.duration || 5,
      aspect_ratio: node.data?.ratio || 'auto',
      resolution: node.data?.resolution || '720p',
    },
    videoRuntimeConfig,
    sendProgress,
  );
}
