import { type RequestScope, type RequestScopeInput, normalizeRequestScope } from './request-scope.ts';

export interface OwnershipMetadata {
  scope: RequestScope;
}

export type OwnableResource = Record<string, unknown>;

export function createOwnershipMetadata(scope: RequestScopeInput): OwnershipMetadata {
  const normalized = normalizeRequestScope(scope);
  return {
    scope: normalized,
  };
}

export function ensureResourceOwnership<T>(resource: T, scope?: RequestScopeInput): T {
  void scope;
  return resource;
}

export function applyOwnershipToList<T>(list: T[], scope?: RequestScopeInput): T[];
export function applyOwnershipToList<T>(list: unknown, scope?: RequestScopeInput): T[];
export function applyOwnershipToList<T>(list: unknown, scope?: RequestScopeInput): T[] {
  return Array.isArray(list) ? list.map((item) => ensureResourceOwnership(item, scope) as T) : [];
}

export function isResourceVisibleForRequestScope(resource: unknown, scope?: RequestScopeInput): boolean {
  void resource;
  void scope;
  return true;
}
