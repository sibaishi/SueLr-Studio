import { fileRawStore } from '@/domains/workflow/components/nodes/io/fileRawStore';
import { uploadFile } from '@/domains/workflow/lib/api/files';

export interface IoImageFileEntry {
  file: File;
  fileId: number;
  fileName: string;
  objectUrl: string;
}

export async function createIoImageFileEntry(blob: Blob, fileName = 'image.png'): Promise<IoImageFileEntry> {
  const file = blob instanceof File ? blob : new File([blob], fileName, { type: blob.type || 'image/png' });
  const base64 = await blobToDataUrl(file);
  const fileId = fileRawStore.add(file, file.name, base64);
  const objectUrl = fileRawStore.getObjectUrl(fileId) || '';

  return {
    file,
    fileId,
    fileName: file.name,
    objectUrl,
  };
}

export async function createIoImageFileEntryFromUrl(src: string, fileName?: string): Promise<IoImageFileEntry> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return createIoImageFileEntry(blob, fileName || imageFileNameFromUrl(src, blob.type));
}

export function uploadIoImageFileEntry(
  entry: IoImageFileEntry,
  onUploaded: (url: string, resultFileName?: string) => void,
) {
  uploadFile(entry.file)
    .then((result) => {
      if (result.success && result.url) {
        onUploaded(result.url, result.fileName);
      }
    })
    .catch(() => {
      // Keep the local raw-store object URL usable for the current session.
    });
}

export function imageFileNameFromUrl(src: string, mimeType = 'image/png') {
  try {
    const url = new URL(src, window.location.href);
    const name = url.pathname.split('/').filter(Boolean).pop();
    if (name) return decodeURIComponent(name);
  } catch {
    // Fall through to extension-based fallback.
  }

  const ext = mimeTypeToExtension(mimeType);
  return `image.${ext}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('avif')) return 'avif';
  if (mimeType.includes('bmp')) return 'bmp';
  return 'png';
}
