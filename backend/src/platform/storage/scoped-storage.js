import path from 'path';
import {
  DEFAULT_SCOPE_USER_ID,
  DEFAULT_SCOPE_WORKSPACE_ID,
  normalizeRequestScope,
} from '../runtime/request-scope.js';
import { ensureDir } from './ensure-dir.js';
import { getStoragePaths } from './storage-paths.js';

export const SCOPED_STORAGE_LAYOUT_VERSION = 'v1';

function cleanNamespaceSegment(value, fallback) {
  const cleaned = String(value || '').trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function isDefaultStorageScope(scope = {}) {
  const normalized = normalizeRequestScope(scope);
  return normalized.userId === DEFAULT_SCOPE_USER_ID
    && normalized.workspaceId === DEFAULT_SCOPE_WORKSPACE_ID;
}

export function createStorageNamespace(scope = {}) {
  const normalized = normalizeRequestScope(scope);
  const defaultScope = isDefaultStorageScope(normalized);
  const workspaceSegment = cleanNamespaceSegment(normalized.workspaceId, DEFAULT_SCOPE_WORKSPACE_ID);
  const userSegment = cleanNamespaceSegment(normalized.userId, DEFAULT_SCOPE_USER_ID);
  const namespaceParts = defaultScope
    ? []
    : ['scopes', SCOPED_STORAGE_LAYOUT_VERSION, 'workspaces', workspaceSegment, 'users', userSegment];

  return {
    scope: normalized,
    isDefaultScope: defaultScope,
    layout: defaultScope ? 'legacy-single-user' : `workspace-scoped-${SCOPED_STORAGE_LAYOUT_VERSION}`,
    namespaceParts,
    namespacePath: namespaceParts.length > 0 ? path.join(...namespaceParts) : '',
  };
}

export function getScopedStoragePaths(scope = {}, basePaths = getStoragePaths()) {
  const namespace = createStorageNamespace(scope);
  const root = namespace.namespacePath
    ? path.join(basePaths.root, namespace.namespacePath)
    : basePaths.root;

  return {
    ...basePaths,
    scopeNamespace: namespace,
    root,
    configDir: path.join(root, 'config'),
    settingsFile: path.join(root, 'config', 'settings.json'),
    adminConfigFile: path.join(root, 'config', 'admin-config.json'),
    accountDetailsFile: path.join(root, 'config', 'account-details.json'),
    legacyAccountDetailsFile: path.join(root, 'config', 'account-6789.json'),
    workflowsDir: path.join(root, 'workflows'),
    assistantDir: path.join(root, 'assistant'),
    conversationsFile: path.join(root, 'assistant', 'conversations.json'),
    galleryFile: path.join(root, 'assistant', 'gallery.json'),
    videosFile: path.join(root, 'assistant', 'videos.json'),
    agentDir: path.join(root, 'agent'),
    agentProfilesFile: path.join(root, 'agent', 'profiles.json'),
    agentMemoriesFile: path.join(root, 'agent', 'memories.json'),
    agentSessionsDir: path.join(root, 'agent', 'sessions'),
    agentLogsDir: path.join(root, 'agent', 'logs'),
    filesDir: path.join(root, 'files'),
    uploadsDir: path.join(root, 'files', 'uploads'),
    generatedDir: path.join(root, 'files', 'generated'),
    logsDir: path.join(root, 'logs'),
    appLogsDir: path.join(root, 'logs', 'app'),
    workflowRunsDir: path.join(root, 'logs', 'workflow-runs'),
  };
}

export function ensureScopedStorageDirectories(scope = {}, basePaths = getStoragePaths()) {
  const storagePaths = getScopedStoragePaths(scope, basePaths);
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
  return storagePaths;
}

export function isResourceVisibleForScope(resource, scope = {}) {
  const normalized = normalizeRequestScope(scope);
  const existingScope = resource?.ownershipScope || (
    resource?.scope && typeof resource.scope === 'object' && !Array.isArray(resource.scope)
      ? resource.scope
      : undefined
  );
  const ownerUserId = resource?.ownerUserId || existingScope?.userId;
  const workspaceId = resource?.workspaceId || existingScope?.workspaceId;

  if (!ownerUserId && !workspaceId) return true;

  return ownerUserId === normalized.userId && workspaceId === normalized.workspaceId;
}
