import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRemoteDownload, readDownloadBuffer } from '../src/platform/http/remote-download.ts';

test('remote downloads handle relative redirects before reading the response', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push(url);
    assert.equal(options.redirect, 'manual');
    if (requests.length === 1) {
      return new Response(null, { status: 302, headers: { location: '/asset' } });
    }
    return new Response('asset');
  });

  const response = await fetchRemoteDownload('http://localhost/start', '资源地址', AbortSignal.timeout(1_000));
  assert.deepEqual(requests, ['http://localhost/start', 'http://localhost/asset']);
  assert.equal((await readDownloadBuffer(response, 5, 'too large')).toString(), 'asset');
});

test('download byte limit cancels the stream before consuming the entire body', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4]));
      controller.enqueue(new Uint8Array([5]));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(readDownloadBuffer(new Response(body), 3, 'too large'), /too large/);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
