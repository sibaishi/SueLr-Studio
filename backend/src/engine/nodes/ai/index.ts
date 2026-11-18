import { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from '../types.ts';
import { executeAudioMode } from './audio.ts';
import { executeChatMode } from './chat.ts';
import { classifyByValue } from './helpers.ts';
import { executeImageMode } from './image.ts';
import { executeMidjourneyMode } from './midjourney.ts';
import { executeVideoMode } from './video.ts';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  // Parse per-edge input data and edge IDs for per-type ordering
  const edgesData: unknown[][] = [];
  const queue = Array.isArray(inputs.input) ? [...inputs.input] : inputs.input !== undefined ? [inputs.input] : [];
  for (const item of queue) {
    if (Array.isArray(item)) edgesData.push(item as unknown[]);
    else edgesData.push([item]);
  }
  const edgeIds: string[] = Array.isArray((inputs as Record<string, unknown>)._inputEdgeIds)
    ? ((inputs as Record<string, unknown>)._inputEdgeIds as string[])
    : [];

  // Per-edge: classify all items into type buckets
  interface EdgeItems {
    texts: string[];
    images: unknown[];
    videos: unknown[];
    audios: unknown[];
  }
  const edgeItems: EdgeItems[] = edgesData.map((data) => {
    const result: EdgeItems = { texts: [], images: [], videos: [], audios: [] };
    for (const item of data) {
      const t = classifyByValue(item);
      switch (t) {
        case 'text':
          result.texts.push(String(item));
          break;
        case 'image':
          result.images.push(item);
          break;
        case 'video':
          result.videos.push(item);
          break;
        case 'audio':
          result.audios.push(item);
          break;
      }
    }
    return result;
  });

  // Build edge index → edge ID mapping, then per-type ordered indices
  const edgeIdToIdx = new Map(edgeIds.map((id, i) => [id, i]));
  const nodeData = (node.data || {}) as Record<string, unknown>;
  const inputOrder = nodeData.inputOrder as Record<string, string[]> | undefined;

  function getOrderedEdgeIndices(type: string): number[] {
    const order = inputOrder?.[type];
    if (order && order.length > 0) {
      const ordered = order.map((eid) => edgeIdToIdx.get(eid)).filter((i): i is number => i !== undefined);
      for (let i = 0; i < edgesData.length; i++) {
        if (!ordered.includes(i)) ordered.push(i);
      }
      return ordered;
    }
    return [...Array(edgesData.length).keys()];
  }

  // Process per-type with independent edge ordering
  let prompt = '';
  const images: DynamicValue[] = [];
  let video: DynamicValue | undefined;
  let audio: DynamicValue | undefined;

  for (const idx of getOrderedEdgeIndices('text')) {
    for (const t of edgeItems[idx].texts) {
      prompt = prompt ? `${prompt}\n${t}` : t;
    }
  }
  for (const idx of getOrderedEdgeIndices('image')) {
    for (const img of edgeItems[idx].images) {
      if (images.length < 9) images.push(img as DynamicValue);
    }
  }
  for (const idx of getOrderedEdgeIndices('video')) {
    for (const vid of edgeItems[idx].videos) {
      if (!video) video = vid as DynamicValue;
    }
  }
  for (const idx of getOrderedEdgeIndices('audio')) {
    for (const aud of edgeItems[idx].audios) {
      if (!audio) audio = aud as DynamicValue;
    }
  }

  const mode = String(nodeData.mode || 'chat');

  if (nodeData.prompt && String(nodeData.prompt).trim() && ['image', 'video', 'audio'].includes(mode)) {
    const extra = String(nodeData.prompt).trim();
    prompt = prompt ? `${prompt}\n${extra}` : extra;
  }

  const runtimeConfig = resolveRuntimeApiConfig({}, apiConfig, nodeData.model);
  if (!runtimeConfig.apiKey) throw new Error('未配置 API Key，请在工作室设置的「连接」中填写。');

  if (mode === 'image') {
    return executeImageMode(prompt, images, nodeData, runtimeConfig, apiConfig, sendProgress);
  }
  if (mode === 'audio') {
    return executeAudioMode(prompt, nodeData, runtimeConfig, apiConfig, sendProgress);
  }
  if (mode === 'video') {
    return executeVideoMode(prompt, images, video, audio, nodeData, runtimeConfig, apiConfig, sendProgress, String(node.id || ''));
  }
  if (mode === 'midjourney') {
    return executeMidjourneyMode(prompt, images, nodeData, runtimeConfig, apiConfig, sendProgress);
  }
  // default: chat
  return executeChatMode(prompt, images, nodeData, runtimeConfig, apiConfig, sendProgress);
}
