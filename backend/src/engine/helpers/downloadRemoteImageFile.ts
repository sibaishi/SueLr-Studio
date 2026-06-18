import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertSafeRemoteDownloadUrl } from '../../platform/security/network-guards.ts';
import { getScopedStoragePaths } from '../../platform/storage/index.ts';
import type { RequestScope } from '../../platform/runtime/request-scope.ts';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 20 * 1024 * 1024;

function describeFetchError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export type FetchedImage = { buffer: Buffer; mimeType: string };

/**
 * Download a remote image URL to a Buffer in memory.
 * Throws on network / safety / size errors.
 */
export async function fetchImageBuffer(
  source: string,
  scope: RequestScope,
  abortSignal?: AbortSignal,
  sendProgress?: (message: string) => void,
): Promise<FetchedImage> {
  if (!/^https?:\/\//i.test(source)) {
    throw new Error(`不支持的图片源: ${source.slice(0, 80)}`);
  }

  sendProgress?.('正在下载远程图片...');
  await assertSafeRemoteDownloadUrl(source, '图片下载地址');

  const signal = abortSignal
    ? AbortSignal.any([abortSignal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)])
    : AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(source, { signal, redirect: 'follow' });
  } catch (error) {
    throw new Error(`下载远程图片失败: ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`下载远程图片失败: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > MAX_BYTES) {
    throw new Error('下载远程图片失败: 文件超过大小限制');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('下载远程图片失败: 文件超过大小限制');
  }

  return { buffer, mimeType: response.headers.get('content-type') || 'image/png' };
}

/** Write an image buffer to the generated files directory and return its API URL. */
export function persistImageBuffer(
  buffer: Buffer,
  mimeType: string,
  scope: RequestScope,
): string {
  const ext = mimeType.split('/').pop() || 'png';
  const fileName = `images/${randomUUID()}.${ext}`;
  const filePath = path.join(getScopedStoragePaths(scope).generatedDir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return `/api/outputs/${fileName}`;
}

/**
 * Download a remote image URL or decode a data URL, persist to disk.
 * Convenience wrapper around fetchImageBuffer + persistImageBuffer.
 *
 * @returns local API URL like `/api/outputs/images/xxx.png`
 */
export async function downloadAndPersistImage(
  source: string,
  scope: RequestScope,
  abortSignal?: AbortSignal,
  sendProgress?: (message: string) => void,
): Promise<string> {
  // ── data URL ──────────────────────────────────────────────
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('无法解析 data URL');
    return persistImageBuffer(Buffer.from(match[2], 'base64'), match[1], scope);
  }

  // ── http URL ──────────────────────────────────────────────
  const fetched = await fetchImageBuffer(source, scope, abortSignal, sendProgress);
  return persistImageBuffer(fetched.buffer, fetched.mimeType, scope);
}
