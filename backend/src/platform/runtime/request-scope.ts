import { type RuntimeMode, getRuntimeMode } from './mode.ts';

export const DEFAULT_SCOPE_USER_ID = 'single-user';
export const DEFAULT_SCOPE_WORKSPACE_ID = 'default';
export interface RequestScopeInput {
  userId?: unknown;
  workspaceId?: unknown;
  runtimeMode?: unknown;
}

export interface RequestScope {
  userId: string;
  workspaceId: string;
  runtimeMode: RuntimeMode;
}

export interface ScopeFoundationSummary extends RequestScope {
  enabled: true;
  source: 'local-single-user';
}

type HeaderMap = Record<string, string | string[] | undefined>;

function cleanScopeValue(value: unknown, fallback: string, maxLength = 120): string {
  const cleaned = String(value || '').trim();
  return (cleaned || fallback).slice(0, maxLength);
}

export function createDefaultRequestScope(runtimeMode: RuntimeMode = getRuntimeMode()): RequestScope {
  return {
    userId: DEFAULT_SCOPE_USER_ID,
    workspaceId: DEFAULT_SCOPE_WORKSPACE_ID,
    runtimeMode,
  };
}

export function normalizeRequestScope(
  scope: RequestScopeInput = {},
  defaults: RequestScope = createDefaultRequestScope(),
): RequestScope {
  const requestedMode = cleanScopeValue(scope.runtimeMode, defaults.runtimeMode);
  const runtimeMode: RuntimeMode =
    requestedMode === 'desktop' || requestedMode === 'local-web' ? requestedMode : defaults.runtimeMode;
  return {
    userId: DEFAULT_SCOPE_USER_ID,
    workspaceId: DEFAULT_SCOPE_WORKSPACE_ID,
    runtimeMode,
  };
}

export function createRequestScope(input: RequestScopeInput = {}): RequestScope {
  const requestedMode = cleanScopeValue(input.runtimeMode, getRuntimeMode());
  const runtimeMode: RuntimeMode =
    requestedMode === 'desktop' || requestedMode === 'local-web' ? requestedMode : getRuntimeMode();
  return normalizeRequestScope(input, createDefaultRequestScope(runtimeMode));
}

export function createRequestScopeFromHeaders(headers: HeaderMap = {}): RequestScope {
  void headers;
  return createRequestScope({
    runtimeMode: getRuntimeMode(),
  });
}

export function summarizeScopeFoundation(
  scope: RequestScopeInput = createDefaultRequestScope(),
): ScopeFoundationSummary {
  const normalized = normalizeRequestScope(scope);
  return {
    enabled: true,
    userId: normalized.userId,
    workspaceId: normalized.workspaceId,
    runtimeMode: normalized.runtimeMode,
    source: 'local-single-user',
  };
}
