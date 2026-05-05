import path from 'path';
import { getStoragePaths } from './storage-paths.js';
import { ensureDir } from './ensure-dir.js';
export { BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot, getStorageRoot } from './storage-root.js';
export { ensureJsonFile, readJsonFile, writeJsonFile } from './json-store.js';
export { safeResolveWithin } from './safe-path.js';
export { LEGACY_PATHS, migrateLegacyStorageIfNeeded } from './legacy-storage.js';
export {
  clearStoredStorageRootOverride,
  getBootstrapConfigPath,
  getEffectiveStorageRootInfo,
  getStoredStorageRootOverride,
  writeStoredStorageRootOverride,
} from './storage-bootstrap.js';

export const STORAGE_PATHS = new Proxy({}, {
  get(_target, property) {
    return getStoragePaths()[property];
  },
});

export function ensureStorageDirectories() {
  const storagePaths = getStoragePaths();
  [
    storagePaths.root,
    storagePaths.configDir,
    storagePaths.workflowsDir,
    storagePaths.assistantDir,
    storagePaths.filesDir,
    storagePaths.uploadsDir,
    storagePaths.generatedDir,
    storagePaths.logsDir,
    storagePaths.appLogsDir,
    storagePaths.workflowRunsDir,
    path.join(storagePaths.generatedDir, 'assistant-images'),
  ].forEach(ensureDir);
}
