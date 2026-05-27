import path from 'node:path';
import { ensureDir } from './ensure-dir.js';
import { type StoragePaths, getStoragePaths } from './storage-paths.js';

export { ensureDir } from './ensure-dir.js';
export { ensureJsonFile, readJsonFile, writeJsonFile } from './json-store.js';
export { safeResolveWithin } from './safe-path.js';
export { APP_CONFIG_DIR_NAME, BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot } from './storage-base.js';
export { getStorageRoot } from './storage-root.js';
export {
  clearStoredStorageRootOverride,
  getBootstrapConfigPath,
  getEffectiveStorageRootInfo,
  getStoredStorageRootOverride,
  writeStoredStorageRootOverride,
} from './storage-bootstrap.js';
export { LEGACY_PATHS, migrateLegacyStorageIfNeeded } from './legacy-storage.js';
export {
  SCOPED_STORAGE_LAYOUT_VERSION,
  createStorageNamespace,
  ensureScopedStorageDirectories,
  getScopedStoragePaths,
  isDefaultStorageScope,
  isResourceVisibleForScope,
} from './scoped-storage.js';

export const STORAGE_PATHS = new Proxy({} as StoragePaths, {
  get(_target, property: string | symbol) {
    if (typeof property !== 'string') return undefined;
    return getStoragePaths()[property as keyof StoragePaths];
  },
}) as StoragePaths;

export function ensureStorageDirectories(): void {
  const storagePaths = getStoragePaths();
  [
    storagePaths.root,
    storagePaths.configDir,
    storagePaths.workflowsDir,
    storagePaths.assistantDir,
    storagePaths.agentDir,
    storagePaths.agentSessionsDir,
    storagePaths.agentLogsDir,
    storagePaths.filesDir,
    storagePaths.uploadsDir,
    storagePaths.generatedDir,
    storagePaths.logsDir,
    storagePaths.appLogsDir,
    storagePaths.workflowRunsDir,
    path.join(storagePaths.generatedDir, 'assistant-images'),
    path.join(storagePaths.generatedDir, 'assistant-videos'),
  ].forEach(ensureDir);
}
