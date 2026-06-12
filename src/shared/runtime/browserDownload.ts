import { loadJSON, saveJSON } from './storage';

const DOWNLOAD_DIR_META_KEY = 'browser_download_directory_meta';
const LEGACY_DOWNLOAD_DIR_META_KEY = ['server', 'web', 'download', 'directory', 'meta'].join('_');
const DOWNLOAD_DIR_DB = 'suelr-browser-downloads';
const DOWNLOAD_DIR_STORE = 'handles';
const DOWNLOAD_DIR_PRIMARY_KEY = 'primary';

type BrowserPermissionState = 'granted' | 'denied' | 'prompt';

type BrowserFileWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type BrowserFileHandle = {
  createWritable: () => Promise<BrowserFileWritable>;
};

type BrowserDirectoryHandle = {
  name?: string;
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserPermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserPermissionState>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserFileHandle>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserDirectoryHandle>;
};

export type BrowserDownloadDirectoryMeta = {
  label: string;
};

export type DownloadableGeneratedFile = {
  url: string;
  name?: string;
  type?: string;
};

function getDirectoryPickerWindow() {
  if (typeof window === 'undefined') return null;
  return window as WindowWithDirectoryPicker;
}

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DOWNLOAD_DIR_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOWNLOAD_DIR_STORE)) {
        database.createObjectStore(DOWNLOAD_DIR_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开浏览器下载目录数据库'));
  });
}

async function readStoredDirectoryHandle(): Promise<BrowserDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openHandleDatabase();
  return await new Promise<BrowserDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(DOWNLOAD_DIR_STORE, 'readonly');
    const store = transaction.objectStore(DOWNLOAD_DIR_STORE);
    const request = store.get(DOWNLOAD_DIR_PRIMARY_KEY);
    request.onsuccess = () => resolve((request.result as BrowserDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error || new Error('无法读取浏览器下载目录'));
  }).finally(() => {
    database.close();
  });
}

async function writeStoredDirectoryHandle(handle: BrowserDirectoryHandle): Promise<void> {
  const database = await openHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DOWNLOAD_DIR_STORE, 'readwrite');
    const store = transaction.objectStore(DOWNLOAD_DIR_STORE);
    const request = store.put(handle, DOWNLOAD_DIR_PRIMARY_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('无法保存浏览器下载目录'));
  }).finally(() => {
    database.close();
  });
}

async function clearStoredDirectoryHandle(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DOWNLOAD_DIR_STORE, 'readwrite');
    const store = transaction.objectStore(DOWNLOAD_DIR_STORE);
    const request = store.delete(DOWNLOAD_DIR_PRIMARY_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('无法清除浏览器下载目录'));
  }).finally(() => {
    database.close();
  });
}

function getDirectoryMetaLabel(handle: BrowserDirectoryHandle) {
  return String(handle.name || '已授权下载目录').trim() || '已授权下载目录';
}

function sanitizeFilename(value: string, fallback = 'download') {
  const trimmed = String(value || fallback).trim();
  return (
    trimmed
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 180) || fallback
  );
}

async function ensureDirectoryPermission(handle: BrowserDirectoryHandle, options?: { interactive?: boolean }) {
  const query = await handle.queryPermission?.({ mode: 'readwrite' });
  if (query === 'granted') return true;
  if (!options?.interactive) return false;
  const next = await handle.requestPermission?.({ mode: 'readwrite' });
  return next === 'granted';
}

function triggerBrowserDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
}

export function isBrowserDownloadDirectorySupported() {
  const pickerWindow = getDirectoryPickerWindow();
  return Boolean(pickerWindow?.showDirectoryPicker && typeof indexedDB !== 'undefined');
}

export function loadBrowserDownloadDirectoryMeta(): BrowserDownloadDirectoryMeta | null {
  const current = loadJSON<BrowserDownloadDirectoryMeta | null>(DOWNLOAD_DIR_META_KEY, null);
  if (current) return current;

  const legacy = loadJSON<BrowserDownloadDirectoryMeta | null>(LEGACY_DOWNLOAD_DIR_META_KEY, null);
  if (legacy) {
    saveJSON(DOWNLOAD_DIR_META_KEY, legacy);
    try {
      localStorage.removeItem(LEGACY_DOWNLOAD_DIR_META_KEY);
    } catch {}
  }
  return legacy;
}

export async function pickBrowserDownloadDirectory(): Promise<BrowserDownloadDirectoryMeta> {
  const pickerWindow = getDirectoryPickerWindow();
  if (!pickerWindow?.showDirectoryPicker) {
    throw new Error('当前浏览器不支持选择自动下载目录，请改用手动下载。');
  }

  const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
  const granted = await ensureDirectoryPermission(handle, { interactive: true });
  if (!granted) {
    throw new Error('浏览器未授予下载目录写入权限。');
  }

  await writeStoredDirectoryHandle(handle);
  const meta = { label: getDirectoryMetaLabel(handle) };
  saveJSON(DOWNLOAD_DIR_META_KEY, meta);
  return meta;
}

export async function clearBrowserDownloadDirectory(): Promise<void> {
  await clearStoredDirectoryHandle();
  try {
    localStorage.removeItem(DOWNLOAD_DIR_META_KEY);
    localStorage.removeItem(LEGACY_DOWNLOAD_DIR_META_KEY);
  } catch {}
}

export async function saveBlobToBrowserDownloadDirectory(blob: Blob, filename: string) {
  const handle = await readStoredDirectoryHandle();
  if (!handle) return false;

  const granted = await ensureDirectoryPermission(handle, { interactive: false });
  if (!granted) return false;

  const nextFile = await handle.getFileHandle(sanitizeFilename(filename), { create: true });
  const writable = await nextFile.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

export async function autoDownloadGeneratedFile(file: DownloadableGeneratedFile) {
  const filename = sanitizeFilename(file.name || file.url.split('/').pop() || 'download');
  const response = await fetch(file.url);
  if (!response.ok) {
    triggerBrowserDownload(file.url, filename);
    return { mode: 'browser' as const, filename };
  }

  const blob = await response.blob();
  const savedToDirectory = await saveBlobToBrowserDownloadDirectory(blob, filename);
  if (savedToDirectory) {
    return { mode: 'directory' as const, filename };
  }

  const objectUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return { mode: 'browser' as const, filename };
}

export async function autoDownloadGeneratedFiles(files: DownloadableGeneratedFile[]) {
  const results = [];
  for (const file of files) {
    results.push(await autoDownloadGeneratedFile(file));
  }
  return results;
}
