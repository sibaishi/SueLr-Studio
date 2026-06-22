export type AsyncTaskState = 'pending' | 'completed' | 'failed';

export type AsyncTaskInspection<TResult> = {
  state: AsyncTaskState;
  result?: TResult;
  error?: string;
  progress?: number;
  preview?: unknown;
};

export type AsyncTaskRunnerOptions<TData, TResult> = {
  poll: () => Promise<TData>;
  inspect: (data: TData) => AsyncTaskInspection<TResult>;
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
  abortMessage?: string;
  timeoutMessage?: string;
  onAttempt?: (attempt: number, elapsedMs: number) => void;
  onProgress?: (progress: number) => void;
  onPreview?: (preview: unknown) => void;
  shouldRetryError?: (error: unknown) => boolean;
};

class AsyncTaskTerminalError extends Error {}

async function waitForNextAttempt(signal: AbortSignal | undefined, intervalMs: number, abortMessage: string) {
  if (intervalMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new Error(abortMessage));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, intervalMs);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function waitForAsyncTask<TData, TResult>({
  poll,
  inspect,
  signal,
  intervalMs = 5000,
  maxAttempts = 120,
  abortMessage = '工作流已手动停止',
  timeoutMessage = '异步任务等待超时',
  onAttempt,
  onProgress,
  onPreview,
  shouldRetryError = () => true,
}: AsyncTaskRunnerOptions<TData, TResult>): Promise<TResult> {
  let lastProgress = Number.NEGATIVE_INFINITY;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new Error(abortMessage);
    onAttempt?.(attempt, attempt * intervalMs);

    try {
      const inspection = inspect(await poll());
      if (inspection.state === 'completed') return inspection.result as TResult;
      if (inspection.preview !== undefined) {
        onPreview?.(inspection.preview);
      }
      if (inspection.state === 'failed') {
        throw new AsyncTaskTerminalError(inspection.error || '异步任务执行失败');
      }
      if (
        typeof inspection.progress === 'number' &&
        Number.isFinite(inspection.progress) &&
        inspection.progress > lastProgress
      ) {
        lastProgress = inspection.progress;
        onProgress?.(inspection.progress);
      }
    } catch (error) {
      if (signal?.aborted) throw new Error(abortMessage);
      if (error instanceof AsyncTaskTerminalError) throw error;
      if (!shouldRetryError(error)) throw error;
    }

    await waitForNextAttempt(signal, intervalMs, abortMessage);
  }

  throw new Error(timeoutMessage);
}
