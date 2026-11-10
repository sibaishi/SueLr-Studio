import { assertSafeRemoteDownloadUrl } from '../security/network-guards.ts';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export async function fetchRemoteDownload(source: string, fieldName: string, signal: AbortSignal): Promise<Response> {
  let url = new URL(source);
  for (let redirects = 0; ; redirects += 1) {
    signal.throwIfAborted();
    await assertSafeRemoteDownloadUrl(url, fieldName);
    const response = await fetch(url.href, { signal, redirect: 'manual' });
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response;

    await response.body?.cancel();
    if (redirects >= MAX_REDIRECTS) throw new Error('远程资源重定向次数超过限制');
    url = new URL(location, url);
  }
}

export async function readDownloadBuffer(response: Response, maxBytes: number, sizeError: string): Promise<Buffer<ArrayBuffer>> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error(sizeError);
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, totalBytes);
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(sizeError);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
