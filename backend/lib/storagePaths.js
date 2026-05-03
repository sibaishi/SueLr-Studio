import { getStorageRoot } from '../src/platform/storage/index.js';
import {
  BACKEND_ROOT,
  LEGACY_PATHS,
  PROJECT_ROOT,
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  migrateLegacyStorageIfNeeded,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../src/platform/storage/index.js';

export {
  BACKEND_ROOT,
  PROJECT_ROOT,
  LEGACY_PATHS,
  STORAGE_PATHS,
  ensureStorageDirectories,
  migrateLegacyStorageIfNeeded,
  ensureJsonFile,
  readJsonFile,
  writeJsonFile,
  safeResolveWithin,
};

export const STORAGE_ROOT = getStorageRoot();
