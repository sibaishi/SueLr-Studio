import { ProviderError } from '../../app/errors/index.ts';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.ts';
import { getProviderAdapter } from '../providers/index.ts';
import type { RequestScope } from '../runtime/request-scope.ts';
import { waitForAsyncTask } from './async-task-runner.ts';

type JsonRecord = Record<string, unknown>;
type ProgressHandler = (message: string) => void;

type ProviderConfig = JsonRecord & {
  midjourneyFetchEndpoint?: string;
  midjourneyPollIntervalMs?: number;
  midjourneyMaxAttempts?: number;
};

type RuntimeConfig = {
  apiKey?: string;
  baseUrl: string;
  providerConfig?: ProviderConfig;
  projectModels?: unknown[];
  abortSignal?: AbortSignal;
  scope?: RequestScope;
};

export type MidjourneyMode = 'fast' | 'relax' | 'turbo';

export type MidjourneyTaskSummary = {
  provider: 'midjourney';
  operation: 'imagine';
  jobId: string;
  status: 'completed';
  progress?: number;
  components: string[];
  imageUrls: string[];
  response: {
    status: string;
    imageCount: number;
    componentCount: number;
  };
};

type MidjourneyResult = {
  images: string[];
  task: MidjourneyTaskSummary;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function findFirstString(value: unknown, keys: string[]): string {
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  const keySet = new Set(keys);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current)) {
      if (keySet.has(key) && typeof nested === 'string' && nested.trim()) return nested.trim();
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return '';
}

function collectStrings(value: unknown, keys: string[]): string[] {
  const results: string[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  const keySet = new Set(keys);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current)) {
      if (keySet.has(key)) {
        const items = Array.isArray(nested) ? nested : [nested];
        for (const item of items) {
          if (typeof item === 'string' && item.trim()) {
            results.push(item.trim());
          } else if (item && typeof item === 'object') {
            const url = findFirstString(item, ['url', 'imageUrl', 'image_url']);
            if (url) results.push(url);
          }
        }
      }
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return [...new Set(results)];
}

function extractJobId(data: unknown): string {
  return findFirstString(data, ['jobId', 'job_id']);
}

function extractStatus(data: unknown): string {
  return findFirstString(data, ['status', 'state']).toUpperCase();
}

function extractProgress(data: unknown): number | undefined {
  const queue: unknown[] = [data];
  const seen = new Set<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current)) {
      if (key === 'progress') {
        const parsed = Number(String(nested).replace('%', ''));
        if (!Number.isFinite(parsed)) return undefined;
        return parsed > 1 ? parsed / 100 : parsed;
      }
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return undefined;
}

function extractImages(data: unknown): string[] {
  const images = collectStrings(data, ['images']);
  const fallback = [
    findFirstString(data, ['cdnImage', 'cdn_image']),
    findFirstString(data, ['discordImage', 'discord_image']),
  ].filter(Boolean);
  const merged = [...new Set([...images, ...fallback])];
  // TT-API 常从多个 CDN 返回同一张四宫格图（cdn.ttapi.io / cloudflarer2.ttapi.io），
  // URL 不同但文件名相同，按文件名去重保留一个
  return deduplicateByFilename(merged);
}

function deduplicateByFilename(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    try {
      const u = new URL(url);
      const key = u.pathname.replace(/\/+$/, '') || url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch {
      return true;
    }
  });
}

function extractComponents(data: unknown): string[] {
  return collectStrings(data, ['components']);
}

function extractError(data: unknown): string {
  return findFirstString(data, ['error', 'message', 'detail', 'reason']) || 'Midjourney 任务执行失败';
}

function resolveFetchEndpoint(submitEndpoint: string, providerConfig?: ProviderConfig): string {
  const configured = cleanText(providerConfig?.midjourneyFetchEndpoint);
  if (configured) return configured;
  if (/\/midjourney\/v1\/imagine(?:\?.*)?$/i.test(submitEndpoint)) {
    return submitEndpoint.replace(/\/imagine(?:\?.*)?$/i, '/fetch');
  }
  return '/midjourney/v1/fetch';
}

async function readJsonResponse(response: Response, errorCode: string): Promise<unknown> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ProviderError(errorCode, extractError(data) || `HTTP ${response.status}`);
  }
  return data;
}

export async function executeMidjourneyImagine(
  request: { model: string; prompt: string; mode?: MidjourneyMode },
  runtimeConfig: RuntimeConfig,
  sendProgress?: ProgressHandler,
): Promise<MidjourneyResult> {
  const apiKey = cleanText(runtimeConfig.apiKey);
  const baseUrl = cleanText(runtimeConfig.baseUrl);
  const prompt = cleanText(request.prompt);
  const mode: MidjourneyMode = ['relax', 'turbo'].includes(cleanText(request.mode))
    ? (cleanText(request.mode) as MidjourneyMode)
    : 'fast';

  if (!apiKey) throw new Error('未配置 Midjourney API Key');
  if (!baseUrl) throw new Error('未配置 Midjourney Base URL');
  if (!prompt) throw new Error('Midjourney 提示词不能为空');

  const resolved = resolveModelRuntime(runtimeConfig, request.model, {
    expectedType: 'image',
    purpose: 'image',
  });
  const submitEndpoint = resolved.endpoint;
  const fetchEndpoint = resolveFetchEndpoint(submitEndpoint, runtimeConfig.providerConfig);
  const adapter = getProviderAdapter();

  sendProgress?.('正在提交 Midjourney 生图任务...');
  const submitResponse = await adapter.jsonRequest({
    apiKey,
    providerConfig: runtimeConfig.providerConfig,
    baseUrl,
    endpoint: submitEndpoint,
    method: 'POST',
    signal: runtimeConfig.abortSignal,
    errorCode: 'MIDJOURNEY_SUBMIT_FAILED',
    body: { prompt, mode },
  });
  const submitData = await readJsonResponse(submitResponse, 'MIDJOURNEY_SUBMIT_FAILED');
  const jobId = extractJobId(submitData);
  if (!jobId) throw new Error('Midjourney 提交成功，但响应中缺少 jobId');
  sendProgress?.(`Midjourney 任务已提交: jobId=${jobId}`);

  const completed = await waitForAsyncTask({
    poll: async () => {
      const separator = fetchEndpoint.includes('?') ? '&' : '?';
      const response = await adapter.rawRequest({
        apiKey,
        providerConfig: runtimeConfig.providerConfig,
        baseUrl,
        endpoint: `${fetchEndpoint}${separator}jobId=${encodeURIComponent(jobId)}`,
        method: 'GET',
        signal: runtimeConfig.abortSignal,
        errorCode: 'MIDJOURNEY_STATUS_FAILED',
      });
      return readJsonResponse(response, 'MIDJOURNEY_STATUS_FAILED');
    },
    inspect: (data) => {
      const status = extractStatus(data);
      const images = extractImages(data);
      if (status === 'SUCCESS') {
        return {
          state: 'completed',
          result: {
            data,
            status: status || 'SUCCESS',
            images,
            components: extractComponents(data),
            progress: extractProgress(data),
          },
        } as const;
      }
      if (['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(status)) {
        return { state: 'failed', error: extractError(data) } as const;
      }
      return { state: 'pending', progress: extractProgress(data) } as const;
    },
    signal: runtimeConfig.abortSignal,
    intervalMs: Number(runtimeConfig.providerConfig?.midjourneyPollIntervalMs ?? 5000),
    maxAttempts: Number(runtimeConfig.providerConfig?.midjourneyMaxAttempts ?? 120),
    abortMessage: '工作流已手动停止',
    timeoutMessage: 'Midjourney 生图超时（超过 10 分钟）',
    onAttempt: (attempt) => sendProgress?.(`正在等待 Midjourney 生图... (${attempt * 5}s)`),
    onProgress: (progress) => sendProgress?.(`Midjourney 生图进度: ${Math.round(progress * 100)}%`),
    shouldRetryError: (error) => !(error instanceof ProviderError),
  });

  if (completed.images.length === 0) throw new Error('Midjourney 任务完成，但没有返回图片');

  return {
    images: completed.images,
    task: {
      provider: 'midjourney',
      operation: 'imagine',
      jobId,
      status: 'completed',
      ...(completed.progress !== undefined ? { progress: completed.progress } : {}),
      components: completed.components,
      imageUrls: completed.images,
      response: {
        status: completed.status,
        imageCount: completed.images.length,
        componentCount: completed.components.length,
      },
    },
  };
}
