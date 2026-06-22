import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForAsyncTask } from '../src/platform/ai/async-task-runner.ts';

test('waitForAsyncTask polls until completion and emits increasing progress', async () => {
  const responses = [
    { status: 'pending', progress: 0.25, value: '' },
    { status: 'pending', progress: 0.25, value: '' },
    { status: 'success', progress: 1, value: 'done' },
  ];
  const attempts: number[] = [];
  const progress: number[] = [];

  const result = await waitForAsyncTask({
    poll: async () => responses.shift()!,
    inspect: (data) =>
      data.status === 'success'
        ? { state: 'completed', result: data.value }
        : { state: 'pending', progress: data.progress },
    intervalMs: 0,
    maxAttempts: 3,
    onAttempt: (attempt) => attempts.push(attempt),
    onProgress: (value) => progress.push(value),
  });

  assert.equal(result, 'done');
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(progress, [0.25]);
});

test('waitForAsyncTask emits preview payloads while polling', async () => {
  const previews: unknown[] = [];
  const responses = [
    { status: 'pending', preview: { url: 'https://example.com/preview.png' } },
    { status: 'success', value: 'done' },
  ];

  const result = await waitForAsyncTask({
    poll: async () => responses.shift()!,
    inspect: (data) =>
      data.status === 'success'
        ? { state: 'completed', result: data.value }
        : { state: 'pending', preview: data.preview },
    intervalMs: 0,
    maxAttempts: 2,
    onPreview: (preview) => previews.push(preview),
  });

  assert.equal(result, 'done');
  assert.deepEqual(previews, [{ url: 'https://example.com/preview.png' }]);
});

test('waitForAsyncTask surfaces terminal failures without retrying', async () => {
  let pollCount = 0;

  await assert.rejects(
    waitForAsyncTask({
      poll: async () => {
        pollCount += 1;
        return { status: 'failed' };
      },
      inspect: () => ({ state: 'failed', error: 'provider failed' }),
      intervalMs: 0,
      maxAttempts: 3,
      shouldRetryError: () => false,
    }),
    /provider failed/,
  );

  assert.equal(pollCount, 1);
});

test('waitForAsyncTask retries transient polling errors', async () => {
  let pollCount = 0;

  const result = await waitForAsyncTask({
    poll: async () => {
      pollCount += 1;
      if (pollCount === 1) throw new Error('temporary transport failure');
      return { value: 42 };
    },
    inspect: (data) => ({ state: 'completed', result: data.value }),
    intervalMs: 0,
    maxAttempts: 2,
  });

  assert.equal(result, 42);
  assert.equal(pollCount, 2);
});

test('waitForAsyncTask aborts while waiting for the next poll', async () => {
  const controller = new AbortController();
  const promise = waitForAsyncTask({
    poll: async () => ({ status: 'pending' }),
    inspect: () => ({ state: 'pending' }),
    signal: controller.signal,
    intervalMs: 1000,
    maxAttempts: 2,
    abortMessage: 'stopped',
  });

  setTimeout(() => controller.abort(), 10);
  await assert.rejects(promise, /stopped/);
});

test('waitForAsyncTask reports timeout after the configured attempts', async () => {
  await assert.rejects(
    waitForAsyncTask({
      poll: async () => ({ status: 'pending' }),
      inspect: () => ({ state: 'pending' }),
      intervalMs: 0,
      maxAttempts: 2,
      timeoutMessage: 'timed out',
    }),
    /timed out/,
  );
});
