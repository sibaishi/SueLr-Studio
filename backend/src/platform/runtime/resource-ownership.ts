import { type RequestScope, type RequestScopeInput, normalizeRequestScope } from './request-scope.js';

export interface OwnershipMetadata {
  ownerUserId: string;
  workspaceId: string;
  scope: RequestScope;
}

export interface OwnableResource {
  ownerUserId?: string | null;
  workspaceId?: string | null;
  ownershipScope?: RequestScopeInput | null;
  scope?: RequestScopeInput | unknown;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readExistingScope(resource: OwnableResource): RequestScopeInput | undefined {
  const resourceScope = resource.scope;
  if (resource.ownershipScope) return resource.ownershipScope;
  return isRecord(resourceScope) ? resourceScope : undefined;
}

export function createOwnershipMetadata(scope: RequestScopeInput): OwnershipMetadata {
  const normalized = normalizeRequestScope(scope);
  return {
    ownerUserId: normalized.userId,
    workspaceId: normalized.workspaceId,
    scope: normalized,
  };
}

export function ensureResourceOwnership<T>(resource: T, scope?: RequestScopeInput): T {
  if (!isRecord(resource)) return resource;
  const ownable = resource as OwnableResource;
  const existingScope = readExistingScope(ownable);
  const ownership = createOwnershipMetadata({
    ...scope,
    userId: ownable.ownerUserId || existingScope?.userId || scope?.userId,
    workspaceId: ownable.workspaceId || existingScope?.workspaceId || scope?.workspaceId,
    runtimeMode: existingScope?.runtimeMode || scope?.runtimeMode,
  });
  return {
    ...ownable,
    ownerUserId: ownable.ownerUserId || ownership.ownerUserId,
    workspaceId: ownable.workspaceId || ownership.workspaceId,
    ownershipScope: existingScope ? normalizeRequestScope(existingScope, ownership.scope) : ownership.scope,
  } as T;
}

export function applyOwnershipToList<T>(list: T[], scope?: RequestScopeInput): T[];
export function applyOwnershipToList<T>(list: unknown, scope?: RequestScopeInput): T[];
export function applyOwnershipToList<T>(list: unknown, scope?: RequestScopeInput): T[] {
  return Array.isArray(list) ? list.map((item) => ensureResourceOwnership(item, scope) as T) : [];
}
