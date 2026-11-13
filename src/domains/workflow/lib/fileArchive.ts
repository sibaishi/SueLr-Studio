import { zipSync } from 'fflate';

export const archiveLimit = 100 * 1024 * 1024;

export function downloadArchive(entries: Record<string, Uint8Array>, name: string) {
  const bytes = zipSync(entries, { level: 0 });
  downloadBlob(new Blob([new Uint8Array(bytes)]), name);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function safeArchiveName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 180) || '文件';
}

export async function readArchiveAsset(url: string, remainingBytes: number): Promise<Blob> {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`无法读取素材：${url}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > remainingBytes) throw new Error('所选文件总大小超过 100 MB。');
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || '' });
}
