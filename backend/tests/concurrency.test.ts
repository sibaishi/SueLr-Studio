import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapConcurrentAndThrowAfterSettled,
  mapConcurrentSettled,
  normalizeConcurrencyConfig,
} from '../src/platform/runtime/concurrency.ts';

test('normalizeConcurrencyConfig disables parallelism without discarding the configured default', () => {
  assert.deepEqual(normalizeConcurrencyConfig({ enabled: false, maxConcurrency: 8 }), {
    enabled: false,
    maxConcurrency: 1,
  });
  assert.deepEqual(normalizeConcurrencyConfig({ enabled: true, maxConcurrency: 2.6 }), {
    enabled: true,
    maxConcurrency: 3,
  });
  assert.deepEqual(normalizeConcurrencyConfig({ enabled: true, maxConcurrency: 0 }, 4), {
    enabled: true,
    maxConcurrency: 4,
  });
});

test('mapConcurrentSettled preserves input order and partial successes', async () => {
  const results = await mapConcurrentSettled(
    [30, 5, 10],
    async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (index === 1) throw new Error('second failed');
      return index;
    },
    3,
  );

  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'rejected', 'fulfilled'],
  );
  assert.equal(results[0].status === 'fulfilled' ? results[0].value : null, 0);
  assert.match(String(results[1].status === 'rejected' ? results[1].reason : ''), /second failed/);
});

test('mapConcurrentAndThrowAfterSettled waits for active and queued work before throwing', async () => {
  const completed: number[] = [];
  const promise = mapConcurrentAndThrowAfterSettled(
    [0, 1, 2, 3],
    async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item === 0 ? 5 : 1));
      completed.push(item);
      if (item === 0) throw new Error('first completion failure');
      return item;
    },
    2,
  );

  await assert.rejects(promise, /first completion failure/);
  assert.deepEqual(completed.sort(), [0, 1, 2, 3]);
});
