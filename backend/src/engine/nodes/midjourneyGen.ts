import { executeMidjourneyImagine, type MidjourneyMode } from '../../platform/ai/midjourney-service.ts';
import { assertSafeRemoteDownloadUrl } from '../../platform/security/network-guards.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import type { NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

function collectPromptParts(value: unknown, parts: string[]) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPromptParts(item, parts);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') {
    collectPromptParts(record.text, parts);
    return;
  }
  for (const key of ['result', 'content', 'prompt', 'text', 'value']) {
    if (key in record) collectPromptParts(record[key], parts);
  }
}

function normalizePrompt(value: unknown): string {
  const parts: string[] = [];
  collectPromptParts(value, parts);
  return parts.join('\n');
}

async function normalizeWorkflowImage(
  value: string,
  signal: AbortSignal | undefined,
  sendProgress: ProgressCallback,
): Promise<string> {
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    sendProgress?.('正在下载 Midjourney 生成结果...');
    await assertSafeRemoteDownloadUrl(value, 'Midjourney 图片下载地址');
    const downloadSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS)])
      : AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(value, { signal: downloadSignal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > REMOTE_IMAGE_MAX_BYTES) throw new Error('文件超过大小限制');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) throw new Error('文件超过大小限制');

    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    sendProgress?.(`下载 Midjourney 图片失败，保留原始 URL: ${error instanceof Error ? error.message : String(error)}`);
    return value;
  }
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const nodeData = node.data || {};
  const prompt = [normalizePrompt(inputs.input), normalizePrompt(nodeData.prompt)].filter(Boolean).join('\n');
  const model = String(nodeData.model || '').trim();
  const runtimeConfig = resolveRuntimeApiConfig({}, apiConfig, model);

  const result = await executeMidjourneyImagine(
    {
      model: String(runtimeConfig.model || model),
      prompt,
      mode: nodeData.mode as MidjourneyMode | undefined,
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
  const workflowImages = await Promise.all(
    result.images.map((image) => normalizeWorkflowImage(image, apiConfig.abortSignal, sendProgress)),
  );
  const deduped = [...new Set(workflowImages)];

  return {
    result: deduped,
    meta: {
      model: String(runtimeConfig.model || model),
      count: deduped.length,
      task: result.task,
    },
  };
}
