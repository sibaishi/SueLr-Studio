import fs from 'node:fs';
import path from 'node:path';
import { getScopedStoragePaths, safeResolveWithin } from '../storage/index.ts';
import type { RequestScope } from '../runtime/request-scope.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const DATA_URL_CACHE_LIMIT = 32;
const dataUrlCache = new Map<string, string>();

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/avi',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

export type MediaResolveOptions = {
  scope?: RequestScope;
};

function decodeUrlPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function resolveUrlPath(baseDir: string, relativePath: string): string | null {
  const resolvedName = String(relativePath || '')
    .split('/')
    .map(decodeUrlPathSegment)
    .join(path.sep);
  return safeResolveWithin(baseDir, resolvedName);
}

export function getMimeType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

export function getLocalApiPath(source: unknown): string {
  const value = String(source || '').trim();
  if (!value || value.startsWith('data:')) return '';
  if (value.startsWith('/api/')) return value;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return LOOPBACK_HOSTS.has(url.hostname) && url.pathname.startsWith('/api/') ? url.pathname : '';
    } catch {
      return '';
    }
  }

  return '';
}

export function localApiPathToFilePath(apiPath: unknown, options: MediaResolveOptions = {}): string | null {
  const value = String(apiPath || '').trim();
  const storagePaths = getScopedStoragePaths(options.scope);
  if (value.startsWith('/api/files/')) {
    return resolveUrlPath(storagePaths.uploadsDir, value.slice('/api/files/'.length));
  }
  if (value.startsWith('/api/outputs/')) {
    return resolveUrlPath(storagePaths.generatedDir, value.slice('/api/outputs/'.length));
  }
  if (value.startsWith('/api/assistant/files/')) {
    return resolveUrlPath(storagePaths.generatedDir, value.slice('/api/assistant/files/'.length));
  }
  return null;
}

export function localUrlToFilePath(source: unknown, options: MediaResolveOptions = {}): string | null {
  const apiPath = getLocalApiPath(source);
  if (!apiPath) return null;
  const filePath = localApiPathToFilePath(apiPath, options);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return filePath;
}

export function localUrlToDataUrl(source: unknown, options: MediaResolveOptions = {}): string {
  const filePath = localUrlToFilePath(source, options);
  if (!filePath) return String(source || '');
  const stat = fs.statSync(filePath);
  const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached) {
    dataUrlCache.delete(cacheKey);
    dataUrlCache.set(cacheKey, cached);
    return cached;
  }

  const dataUrl = `data:${getMimeType(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
  dataUrlCache.set(cacheKey, dataUrl);
  if (dataUrlCache.size > DATA_URL_CACHE_LIMIT) {
    const oldestKey = dataUrlCache.keys().next().value;
    if (oldestKey) dataUrlCache.delete(oldestKey);
  }
  return dataUrl;
}

export async function mediaSourceToDataUrl(source: unknown, options: MediaResolveOptions = {}): Promise<string | null> {
  const value = String(source || '').trim();
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  if (value.startsWith('blob:')) {
    throw new Error('检测到浏览器本地预览文件，后端无法直接读取。请等待文件上传完成后再执行。');
  }
  if (/^https?:\/\//i.test(value)) {
    const localDataUrl = localUrlToDataUrl(value, options);
    return localDataUrl === value ? value : localDataUrl;
  }

  const localDataUrl = localUrlToDataUrl(value, options);
  return localDataUrl || value;
}

export function isLocalApiMediaUrl(source: unknown): boolean {
  return Boolean(getLocalApiPath(source));
}
