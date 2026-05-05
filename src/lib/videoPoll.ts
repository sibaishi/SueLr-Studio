import { capabilityPollVideoTask } from '@/shared/api/capabilities';

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
      const pd = await capabilityPollVideoTask(taskId);
      const st = pd.status || pd.data?.status;
      if (st === 'succeeded' || st === 'complete' || st === 'completed') {
        cleanup();
        const url = pd.video_url || pd.output?.video_url || pd.data?.video_url || pd.data?.output?.video_url;
        if (url) { onSuccess(url); } else { onNoUrl(); }
      } else if (st === 'failed' || st === 'error') {
        cleanup();
        const err = String(pd.error || pd.data?.error || '生成失败');
        onFailure(err);
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
      const pd = await capabilityPollVideoTask(taskId);
      const st = pd.status || pd.data?.status;
      if (st === 'succeeded' || st === 'complete' || st === 'completed') {
        const url = pd.video_url || pd.output?.video_url || pd.data?.video_url || pd.data?.output?.video_url;
        if (url) {
          onSuccess(url);
          return url;
        }
        onNoUrl();
        throw new Error('未获得视频 URL');
      }
      if (st === 'failed' || st === 'error') {
        const err = String(pd.error || pd.data?.error || '视频生成失败');
        onFailure(err);
        throw new Error(err);
      }
    } catch (err: any) {
      onPollError(err.message);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
