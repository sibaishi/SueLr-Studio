import path from 'path';
import { getStoragePaths } from './storage-paths.js';
import { ensureDir } from './ensure-dir.js';
export { BACKEND_ROOT, PROJECT_ROOT, getStorageRoot } from './storage-root.js';
export { ensureJsonFile, readJsonFile, writeJsonFile } from './json-store.js';
export { safeResolveWithin } from './safe-path.js';
export { LEGACY_PATHS, migrateLegacyStorageIfNeeded } from './legacy-storage.js';

export const STORAGE_PATHS = getStoragePaths();

export function ensureStorageDirectories() {
  [
    STORAGE_PATHS.root,
    STORAGE_PATHS.configDir,
    STORAGE_PATHS.workflowsDir,
    STORAGE_PATHS.assistantDir,
    STORAGE_PATHS.filesDir,
    STORAGE_PATHS.uploadsDir,
    STORAGE_PATHS.generatedDir,
    STORAGE_PATHS.logsDir,
    STORAGE_PATHS.appLogsDir,
    STORAGE_PATHS.workflowRunsDir,
    path.join(STORAGE_PATHS.generatedDir, 'assistant-images'),
  ].forEach(ensureDir);
}
