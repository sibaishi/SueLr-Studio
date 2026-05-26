import { normalizeRequestScope } from './request-scope.js';

export function createOwnershipMetadata(scope) {
  const normalized = normalizeRequestScope(scope);
  return {
    ownerUserId: normalized.userId,
    workspaceId: normalized.workspaceId,
    scope: normalized,
  };
}

export function ensureResourceOwnership(resource, scope) {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return resource;
  const existingScope = resource.ownershipScope || (
    resource.scope && typeof resource.scope === 'object' && !Array.isArray(resource.scope)
      ? resource.scope
      : undefined
  );
  const ownership = createOwnershipMetadata({
    ...scope,
    userId: resource.ownerUserId || existingScope?.userId || scope?.userId,
    workspaceId: resource.workspaceId || existingScope?.workspaceId || scope?.workspaceId,
    runtimeMode: existingScope?.runtimeMode || scope?.runtimeMode,
  });
  return {
    ...resource,
    ownerUserId: resource.ownerUserId || ownership.ownerUserId,
    workspaceId: resource.workspaceId || ownership.workspaceId,
    ownershipScope: existingScope
      ? normalizeRequestScope(existingScope, ownership.scope)
      : ownership.scope,
  };
}

export function applyOwnershipToList(list, scope) {
  return Array.isArray(list) ? list.map((item) => ensureResourceOwnership(item, scope)) : [];
}
