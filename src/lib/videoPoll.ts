import { capabilityPollVideoTask } from '@/shared/api/capabilities';

type VideoPollResponse = Awaited<ReturnType<typeof capabilityPollVideoTask>>;

interface PollOptions {
  /** Platform task ID to poll */
  taskId: string;
  /** Key for managing the interval ref */
  pollKey: string;
  /** Ref holding active intervals */
  pollRefs: React.MutableRefObject<Record<string, ReturnType<typeof setInterval>>>;
  /** API base URL ref */
  baseR: React.MutableRefObject<string>;
  /** API key ref */
  keyR: React.MutableRefObject<string>;
  /** Called when video is ready */
  onSuccess: (url: string) => void;
  /** Called when task completes but no URL */
  onNoUrl: () => void;
  /** Called when task fails */
  onFailure: (error: string) => void;
  /** Called on poll fetch error */
  onPollError: (error: string) => void;
}

function getTaskStatus(result: VideoPollResponse): string | undefined {
  return result.status || result.data?.status;
}

function getVideoUrl(result: VideoPollResponse): string | undefined {
  return result.video_url || result.output?.video_url || result.data?.video_url || result.data?.output?.video_url;
}

function getTaskError(result: VideoPollResponse, fallback: string): string {
  return String(result.error || result.data?.error || fallback);
}

/** Start polling a video generation task. Returns a cancel function. */
export function startVideoPoll(opts: PollOptions): () => void {
  const { taskId, pollKey, pollRefs, onSuccess, onNoUrl, onFailure, onPollError } = opts;
  const cleanup = () => {
    if (pollRefs.current[pollKey]) {
      clearInterval(pollRefs.current[pollKey]);
      delete pollRefs.current[pollKey];
    }
  };

  pollRefs.current[pollKey] = setInterval(async () => {
    try {
      const result = await capabilityPollVideoTask(taskId);
      const status = getTaskStatus(result);

      if (status === 'succeeded' || status === 'complete' || status === 'completed') {
        cleanup();
        const url = getVideoUrl(result);
        if (url) {
          onSuccess(url);
        } else {
          onNoUrl();
        }
      } else if (status === 'failed' || status === 'error') {
        cleanup();
        onFailure(getTaskError(result, '鐢熸垚澶辫触'));
      }
    } catch (err: any) {
      onPollError(err.message);
    }
  }, 5000);

  return cleanup;
}

export async function waitForVideoCompletion(opts: Omit<PollOptions, 'pollRefs' | 'pollKey'> & { intervalMs?: number }): Promise<string> {
  const { taskId, onSuccess, onNoUrl, onFailure, onPollError, intervalMs = 5000 } = opts;
  while (true) {
    try {
      const result = await capabilityPollVideoTask(taskId);
      const status = getTaskStatus(result);

      if (status === 'succeeded' || status === 'complete' || status === 'completed') {
        const url = getVideoUrl(result);
        if (url) {
          onSuccess(url);
          return url;
        }
        onNoUrl();
        throw new Error('鏈幏寰楄棰?URL');
      }

      if (status === 'failed' || status === 'error') {
        const error = getTaskError(result, '瑙嗛鐢熸垚澶辫触');
        onFailure(error);
        throw new Error(error);
      }
    } catch (err: any) {
      onPollError(err.message);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
