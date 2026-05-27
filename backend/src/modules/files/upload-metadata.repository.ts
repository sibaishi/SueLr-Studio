import path from 'node:path';
import { STORAGE_PATHS, ensureJsonFile, readJsonFile, writeJsonFile } from '../../platform/storage/index.ts';
import type { DynamicValue } from '../types.ts';
import type { UploadMetadataStore, UploadRecord } from './types.ts';

const STORE_FILE = () => path.join(STORAGE_PATHS.filesDir, 'upload-metadata.json');

function createEmptyStore(): UploadMetadataStore {
  return { items: {} };
}

function readStore(): UploadMetadataStore {
  const filePath = STORE_FILE();
  ensureJsonFile(filePath, createEmptyStore());
  const value = readJsonFile(filePath, createEmptyStore()) as DynamicValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyStore();
  if (!value.items || typeof value.items !== 'object' || Array.isArray(value.items)) return createEmptyStore();
  return value;
}

function writeStore(store: UploadMetadataStore) {
  writeJsonFile(STORE_FILE(), store);
}

export class UploadMetadataRepository {
  get(filename: DynamicValue): UploadRecord | null {
    const store = readStore();
    return store.items[String(filename || '')] || null;
  }

  set(filename: DynamicValue, record: UploadRecord) {
    const key = String(filename || '').trim();
    if (!key) return null;
    const store = readStore();
    store.items[key] = record;
    writeStore(store);
    return store.items[key];
  }

  patch(filename: DynamicValue, patch: UploadRecord) {
    const key = String(filename || '').trim();
    if (!key) return null;
    const store = readStore();
    const current = store.items[key] || {};
    store.items[key] = { ...current, ...patch };
    writeStore(store);
    return store.items[key];
  }

  delete(filename: DynamicValue) {
    const key = String(filename || '').trim();
    if (!key) return;
    const store = readStore();
    if (!(key in store.items)) return;
    delete store.items[key];
    writeStore(store);
  }

  listPendingImageRecords() {
    const store = readStore();
    return Object.entries(store.items)
      .filter(([, item]) => item?.kind === 'image' && item?.processingStatus === 'processing')
      .map(([filename, item]) => ({ filename, ...item }));
  }
}

export const uploadMetadataRepository = new UploadMetadataRepository();
