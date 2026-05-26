import { getRuntimeMode } from './mode.js';

export const DEFAULT_SCOPE_USER_ID = 'single-user';
export const DEFAULT_SCOPE_WORKSPACE_ID = 'default';
export const SCOPE_HEADER_USER_ID = 'x-suelr-user-id';
export const SCOPE_HEADER_WORKSPACE_ID = 'x-suelr-workspace-id';
export const SCOPE_HEADER_RUNTIME_MODE = 'x-suelr-runtime-mode';

function cleanScopeValue(value, fallback, maxLength = 120) {
  const cleaned = String(value || '').trim();
  return (cleaned || fallback).slice(0, maxLength);
}

export function createDefaultRequestScope(runtimeMode = getRuntimeMode()) {
  return {
    userId: DEFAULT_SCOPE_USER_ID,
    workspaceId: DEFAULT_SCOPE_WORKSPACE_ID,
    runtimeMode,
  };
}

export function normalizeRequestScope(scope = {}, defaults = createDefaultRequestScope()) {
  return {
    userId: cleanScopeValue(scope.userId, defaults.userId),
    workspaceId: cleanScopeValue(scope.workspaceId, defaults.workspaceId),
    runtimeMode: cleanScopeValue(scope.runtimeMode, defaults.runtimeMode),
  };
}

export function createRequestScope(input = {}) {
  const runtimeMode = cleanScopeValue(input.runtimeMode, getRuntimeMode());
  return normalizeRequestScope(input, createDefaultRequestScope(runtimeMode));
}

export function createRequestScopeFromHeaders(headers = {}) {
  return createRequestScope({
    userId: headers[SCOPE_HEADER_USER_ID],
    workspaceId: headers[SCOPE_HEADER_WORKSPACE_ID],
    runtimeMode: headers[SCOPE_HEADER_RUNTIME_MODE],
  });
}

export function summarizeScopeFoundation(scope = createDefaultRequestScope()) {
  const normalized = normalizeRequestScope(scope);
  return {
    enabled: true,
    userId: normalized.userId,
    workspaceId: normalized.workspaceId,
    runtimeMode: normalized.runtimeMode,
    source: normalized.userId === DEFAULT_SCOPE_USER_ID && normalized.workspaceId === DEFAULT_SCOPE_WORKSPACE_ID
      ? 'single-user-default'
      : 'request',
  };
}
