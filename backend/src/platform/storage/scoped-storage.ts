import path from 'node:path';
import { normalizeRequestScope } from '../runtime/request-scope.ts';
import { ensureDir } from './ensure-dir.ts';
import { type StoragePaths, getStoragePaths } from './storage-paths.ts';

export const SCOPED_STORAGE_LAYOUT_VERSION = 'v1';

export interface RequestScope {
  userId?: string;
  workspaceId?: string;
  runtimeMode?: string;
}

export interface NormalizedRequestScope {
  userId: string;
  workspaceId: string;
  runtimeMode: string;
}

export interface StorageNamespace {
  scope: NormalizedRequestScope;
  isDefaultScope: boolean;
  layout: 'local-single-user';
  namespaceParts: string[];
  namespacePath: string;
}

export interface ScopedStoragePaths extends StoragePaths {
  scopeNamespace: StorageNamespace;
}

function normalizeScope(scope: RequestScope = {}): NormalizedRequestScope {
  return normalizeRequestScope(scope) as NormalizedRequestScope;
}

export function isDefaultStorageScope(scope: RequestScope = {}): boolean {
  void scope;
  return true;
}

export function createStorageNamespace(scope: RequestScope = {}): StorageNamespace {
  const normalized = normalizeScope(scope);

  return {
    scope: normalized,
    isDefaultScope: true,
    layout: 'local-single-user',
    namespaceParts: [],
    namespacePath: '',
  };
}

export function getScopedStoragePaths(
  scope: RequestScope = {},
  basePaths: StoragePaths = getStoragePaths(),
): ScopedStoragePaths {
  const namespace = createStorageNamespace(scope);
  const root = namespace.namespacePath ? path.join(basePaths.root, namespace.namespacePath) : basePaths.root;

  return {
    ...basePaths,
    scopeNamespace: namespace,
    root,
    configDir: path.join(root, 'config'),
    settingsFile: path.join(root, 'config', 'settings.json'),
    workflowsDir: path.join(root, 'workflows'),
    assistantDir: path.join(root, 'assistant'),
    conversationsFile: path.join(root, 'assistant', 'conversations.json'),
    galleryFile: path.join(root, 'assistant', 'gallery.json'),
    videosFile: path.join(root, 'assistant', 'videos.json'),
    filesDir: path.join(root, 'files'),
    uploadsDir: path.join(root, 'files', 'uploads'),
    generatedDir: path.join(root, 'files', 'generated'),
    runtimeDir: path.join(root, 'runtime'),
    workflowRuntimeDir: path.join(root, 'runtime', 'workflows'),
    logsDir: path.join(root, 'logs'),
    appLogsDir: path.join(root, 'logs', 'app'),
    workflowRunsDir: path.join(root, 'logs', 'workflow-runs'),
  };
}

export function ensureScopedStorageDirectories(
  scope: RequestScope = {},
  basePaths: StoragePaths = getStoragePaths(),
): ScopedStoragePaths {
  const storagePaths = getScopedStoragePaths(scope, basePaths);
  [
    storagePaths.root,
    storagePaths.configDir,
    storagePaths.workflowsDir,
    storagePaths.assistantDir,
    storagePaths.filesDir,
    storagePaths.uploadsDir,
    storagePaths.generatedDir,
    storagePaths.runtimeDir,
    storagePaths.workflowRuntimeDir,
    storagePaths.logsDir,
    storagePaths.appLogsDir,
    storagePaths.workflowRunsDir,
    path.join(storagePaths.generatedDir, 'assistant-images'),
    path.join(storagePaths.generatedDir, 'assistant-videos'),
  ].forEach(ensureDir);
  return storagePaths;
}

export function isResourceVisibleForScope(resource: unknown, scope: RequestScope = {}): boolean {
  void resource;
  void scope;
  return true;
}
