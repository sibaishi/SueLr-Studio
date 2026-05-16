import { capabilityPollVideoTask } from '@/shared/api/capabilities';
import type { ApiConfigPayload } from '@/shared/api/capabilities';

type VideoPollResponse = Awaited<ReturnType<typeof capabilityPollVideoTask>>;
type NormalizedVideoTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
type VideoPollResponseWithResultUrl = VideoPollResponse & {
  result_url?: string;
  data?: VideoPollResponse['data'] & { result_url?: string; data?: { metadata?: { url?: string } } };
};

interface PollOptions {
  taskId: string;
  pollKey: string;
  pollRefs: React.MutableRefObject<Record<string, ReturnType<typeof setInterval>>>;
  baseR: React.MutableRefObject<string>;
  keyR: React.MutableRefObject<string>;
  apiConfig?: ApiConfigPayload;
  apiConfigCandidates?: ApiConfigPayload[];
  onSuccess: (url: string, urls?: string[]) => void;
  onNoUrl: () => void;
  onFailure: (error: string) => void;
  onPollError: (error: string) => void;
  onStatusUpdate?: (status: string) => void;
}

function findFirstStringByKeys(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const keySet = new Set(keys);
  const queue: unknown[] = [value];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;
    if (seen.has(item as object)) continue;
    seen.add(item as object);

    for (const [key, nested] of Object.entries(item)) {
      if (keySet.has(key) && typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
      if (nested && typeof nested === 'object') {
        queue.push(nested);
      }
    }
  }

  return undefined;
}

function getVideoUrls(result: VideoPollResponse): string[] {
  const extended = result as VideoPollResponseWithResultUrl;
  const directCandidates = [
    result.content?.video_url,
    result.output?.video_url,
    result.data?.content?.video_url,
    result.data?.output?.video_url,
    extended.data?.data?.metadata?.url,
  ];
  const discovered = findFirstStringByKeys(result, [
    'video_url',
    'videoUrl',
    'file_url',
    'fileUrl',
    'media_url',
    'mediaUrl',
    'download_url',
    'downloadUrl',
    'url',
  ]);
  const fallbackCandidates = [
    discovered,
    extended.result_url,
    extended.data?.result_url,
  ];

  const seen = new Set<string>();
  return [...directCandidates, ...fallbackCandidates]
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function getTaskError(result: VideoPollResponse, fallback: string): string {
  const rawError = result.error
    ?? result.data?.error
    ?? findFirstStringByKeys(result, ['error', 'message', 'detail', 'reason']);
  if (!rawError) return fallback;
  if (typeof rawError === 'string') return rawError;
  if (typeof rawError === 'object') {
    const message = findFirstStringByKeys(rawError, ['message', 'code', 'detail', 'error', 'reason']);
    if (message) return message;
  }
  return fallback;
}

function readRawTaskStatus(result: VideoPollResponse): string | undefined {
  return findFirstStringByKeys(result, ['status', 'state', 'phase']);
}

export function normalizeVideoTaskStatus(rawStatus: string | undefined, hasVideoUrl = false, hasError = false): NormalizedVideoTaskStatus | undefined {
  const normalized = String(rawStatus || '').trim().toLowerCase();

  if (['queued', 'pending', 'submitted', 'created'].includes(normalized)) return 'queued';
  if (['processing', 'running', 'in_progress', 'in-progress', 'progressing'].includes(normalized)) return 'processing';
  if (['succeeded', 'success', 'complete', 'completed', 'done', 'finished'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'errored'].includes(normalized)) return 'failed';
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) return 'cancelled';
  if (hasVideoUrl) return 'completed';
  if (hasError) return 'failed';
  return undefined;
}

async function pollTask(taskId: string, apiConfig?: ApiConfigPayload): Promise<{ status?: NormalizedVideoTaskStatus; rawStatus?: string; url?: string; urls?: string[]; error?: string }> {
  const result = await capabilityPollVideoTask(taskId, apiConfig);
  const urls = getVideoUrls(result);
  const url = urls[0];
  const error = getTaskError(result, 'Video generation failed');
  const rawStatus = readRawTaskStatus(result);

  return {
    status: normalizeVideoTaskStatus(rawStatus, Boolean(url), Boolean(result.error ?? result.data?.error)),
    rawStatus,
    url,
    urls,
    error,
  };
}

async function pollTaskWithCandidates(
  taskId: string,
  apiConfig?: ApiConfigPayload,
  apiConfigCandidates?: ApiConfigPayload[],
): Promise<{ status?: NormalizedVideoTaskStatus; rawStatus?: string; url?: string; urls?: string[]; error?: string }> {
  const candidates = apiConfigCandidates?.length ? apiConfigCandidates : (apiConfig ? [apiConfig] : []);
  if (candidates.length === 0) return pollTask(taskId);

  const errors: string[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      return await pollTask(taskId, candidates[index]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`config ${index + 1}: ${message}`);
    }
  }

  throw new Error(`All API configs failed while polling task ${taskId}: ${errors.join(' | ')}`);
}

export function startVideoPoll(opts: PollOptions): () => void {
  const { taskId, pollKey, pollRefs, apiConfig, apiConfigCandidates, onSuccess, onNoUrl, onFailure, onPollError, onStatusUpdate } = opts;

  const cleanup = () => {
    if (pollRefs.current[pollKey]) {
      clearInterval(pollRefs.current[pollKey]);
      delete pollRefs.current[pollKey];
    }
  };

  const pollOnce = async () => {
    try {
      const result = await pollTaskWithCandidates(taskId, apiConfig, apiConfigCandidates);
      const displayStatus = result.rawStatus || result.status;

      if (displayStatus) {
        onStatusUpdate?.(displayStatus);
      }

      if (result.status === 'completed') {
        cleanup();
        if (result.url) onSuccess(result.url, result.urls);
        else onNoUrl();
        return;
      }

      if (result.status === 'failed' || result.status === 'cancelled') {
        cleanup();
        onFailure(result.error || 'Video generation failed');
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      if (apiConfigCandidates?.length) {
        cleanup();
        onFailure(message);
        return;
      }
      onPollError(message);
    }
  };

  void pollOnce();
  pollRefs.current[pollKey] = setInterval(pollOnce, 5000);
  return cleanup;
}

export async function waitForVideoCompletion(
  opts: Omit<PollOptions, 'pollRefs' | 'pollKey'> & { intervalMs?: number },
): Promise<string> {
  const { taskId, apiConfig, apiConfigCandidates, onSuccess, onNoUrl, onFailure, onPollError, onStatusUpdate, intervalMs = 5000 } = opts;

  while (true) {
    try {
      const result = await pollTaskWithCandidates(taskId, apiConfig, apiConfigCandidates);
      const displayStatus = result.rawStatus || result.status;

      if (displayStatus) {
        onStatusUpdate?.(displayStatus);
      }

      if (result.status === 'completed') {
        if (result.url) {
          onSuccess(result.url, result.urls);
          return result.url;
        }
        onNoUrl();
        throw new Error('No video URL returned for completed task');
      }

      if (result.status === 'failed' || result.status === 'cancelled') {
        const error = result.error || 'Video generation failed';
        onFailure(error);
        throw new Error(error);
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      if (apiConfigCandidates?.length) {
        onFailure(message);
      }
      onPollError(message);
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
