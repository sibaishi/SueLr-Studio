import fs from 'node:fs';
import {
  getMimeType,
  isLocalApiMediaUrl,
  localUrlToFilePath,
  mediaSourceToDataUrl,
} from '../../platform/media/media-resolver.js';

export function urlToLocalPath(url: string): string | null {
  return localUrlToFilePath(url);
}

export async function fileToBase64(url: unknown): Promise<string | null> {
  return mediaSourceToDataUrl(url);
}

export function isLocalFileUrl(url: string): boolean {
  return isLocalApiMediaUrl(url);
}

export function getFileInfo(url: string): { exists: true; size: number; mime: string } | null {
  const localPath = urlToLocalPath(url);
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
