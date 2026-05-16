import { capabilityPollVideoTask } from '@/shared/api/capabilities';
import type { ApiConfigPayload } from '@/shared/api/capabilities';

type VideoPollResponse = Awaited<ReturnType<typeof capabilityPollVideoTask>>;

interface PollOptions {
  taskId: string;
  pollKey: string;
  pollRefs: React.MutableRefObject<Record<string, ReturnType<typeof setInterval>>>;
  baseR: React.MutableRefObject<string>;
  keyR: React.MutableRefObject<string>;
  apiConfig?: ApiConfigPayload;
  apiConfigCandidates?: ApiConfigPayload[];
  onSuccess: (url: string) => void;
  onNoUrl: () => void;
  onFailure: (error: string) => void;
  onPollError: (error: string) => void;
}

function getTaskStatus(result: VideoPollResponse): string | undefined {
  return result.status || result.data?.status;
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

function getVideoUrl(result: VideoPollResponse): string | undefined {
  return findFirstStringByKeys(result, ['video_url']);
}

function getTaskError(result: VideoPollResponse, fallback: string): string {
  const rawError = result.error ?? result.data?.error;
  if (!rawError) return fallback;
  if (typeof rawError === 'string') return rawError;
  if (typeof rawError === 'object') {
    const message = findFirstStringByKeys(rawError, ['message', 'code', 'detail', 'error']);
    if (message) return message;
  }
  return fallback;
}

async function pollTask(taskId: string, apiConfig?: ApiConfigPayload): Promise<{ status?: string; url?: string; error?: string }> {
  const result = await capabilityPollVideoTask(taskId, apiConfig);
  return {
    status: getTaskStatus(result),
    url: getVideoUrl(result),
    error: getTaskError(result, 'Video generation failed'),
  };
}

async function pollTaskWithCandidates(
  taskId: string,
  apiConfig?: ApiConfigPayload,
  apiConfigCandidates?: ApiConfigPayload[],
): Promise<{ status?: string; url?: string; error?: string }> {
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
  const { taskId, pollKey, pollRefs, apiConfig, apiConfigCandidates, onSuccess, onNoUrl, onFailure, onPollError } = opts;

  const cleanup = () => {
    if (pollRefs.current[pollKey]) {
      clearInterval(pollRefs.current[pollKey]);
      delete pollRefs.current[pollKey];
    }
  };

  const pollOnce = async () => {
    try {
      const result = await pollTaskWithCandidates(taskId, apiConfig, apiConfigCandidates);

      if (result.status === 'succeeded' || result.status === 'complete' || result.status === 'completed') {
        cleanup();
        if (result.url) onSuccess(result.url);
        else onNoUrl();
        return;
      }

      if (result.status === 'failed' || result.status === 'error') {
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
  const { taskId, apiConfig, apiConfigCandidates, onSuccess, onNoUrl, onFailure, onPollError, intervalMs = 5000 } = opts;

  while (true) {
    try {
      const result = await pollTaskWithCandidates(taskId, apiConfig, apiConfigCandidates);

      if (result.status === 'succeeded' || result.status === 'complete' || result.status === 'completed') {
        if (result.url) {
          onSuccess(result.url);
          return result.url;
        }
        onNoUrl();
        throw new Error('No video URL returned for completed task');
      }

      if (result.status === 'failed' || result.status === 'error') {
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
