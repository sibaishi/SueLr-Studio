export type ConcurrencyConfig = {
  enabled: boolean;
  maxConcurrency: number;
};

export type ConcurrentSettledResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

export function normalizeConcurrencyConfig(
  value: { enabled?: unknown; maxConcurrency?: unknown } | null | undefined,
  defaultMaxConcurrency = 5,
): ConcurrencyConfig {
  const enabled = value?.enabled === true;
  const parsedMaxConcurrency = Number(value?.maxConcurrency);
  const maxConcurrency =
    Number.isFinite(parsedMaxConcurrency) && parsedMaxConcurrency > 0
      ? Math.max(1, Math.round(parsedMaxConcurrency))
      : defaultMaxConcurrency;

  return {
    enabled,
    maxConcurrency: enabled ? maxConcurrency : 1,
  };
}

export async function mapConcurrentSettled<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  maxConcurrency: number,
): Promise<Array<ConcurrentSettledResult<R>>> {
  if (items.length === 0) return [];

  const results = new Array<ConcurrentSettledResult<R>>(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };

  const workerCount = Math.min(Math.max(1, Math.round(maxConcurrency)), items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export async function mapConcurrentAndThrowAfterSettled<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  let firstCompletedError: unknown;
  const results = await mapConcurrentSettled(
    items,
    async (item, index) => {
      try {
        return await worker(item, index);
      } catch (error) {
        firstCompletedError ??= error;
        throw error;
      }
    },
    maxConcurrency,
  );

  if (firstCompletedError !== undefined) throw firstCompletedError;
  return results.map((result) => (result as { status: 'fulfilled'; value: R }).value);
}
