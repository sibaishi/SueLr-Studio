import fs from 'node:fs';
import {
  getMimeType,
  isLocalApiMediaUrl,
  localUrlToFilePath,
  mediaSourceToDataUrl,
} from '../../platform/media/media-resolver.js';

export function urlToLocalPath(url) {
  return localUrlToFilePath(url);
}

export async function fileToBase64(url) {
  return mediaSourceToDataUrl(url);
}

export function isLocalFileUrl(url) {
  return isLocalApiMediaUrl(url);
}

export function getFileInfo(url) {
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
