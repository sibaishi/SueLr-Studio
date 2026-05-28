import fs from 'node:fs';
import {
  type MediaResolveOptions,
  getMimeType,
  isLocalApiMediaUrl,
  localUrlToFilePath,
  mediaSourceToDataUrl,
} from '../../platform/media/media-resolver.ts';

export function urlToLocalPath(url: string, options: MediaResolveOptions = {}): string | null {
  return localUrlToFilePath(url, options);
}

export async function fileToBase64(url: unknown, options: MediaResolveOptions = {}): Promise<string | null> {
  return mediaSourceToDataUrl(url, options);
}

export function isLocalFileUrl(url: string): boolean {
  return isLocalApiMediaUrl(url);
}

export function getFileInfo(url: string, options: MediaResolveOptions = {}): { exists: true; size: number; mime: string } | null {
  const localPath = urlToLocalPath(url, options);
  if (!localPath) return null;

  try {
    const stat = fs.statSync(localPath);
    return {
      exists: true,
      size: stat.size,
      mime: getMimeType(localPath),
    };
  } catch {
    return null;
  }
}

export { getMimeType };
