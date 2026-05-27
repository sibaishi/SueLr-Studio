import { type RuntimeMode, getRuntimeMode } from './mode.js';

export const DEFAULT_SCOPE_USER_ID = 'single-user';
export const DEFAULT_SCOPE_WORKSPACE_ID = 'default';
export const SCOPE_HEADER_USER_ID = 'x-suelr-user-id';
export const SCOPE_HEADER_WORKSPACE_ID = 'x-suelr-workspace-id';
export const SCOPE_HEADER_RUNTIME_MODE = 'x-suelr-runtime-mode';

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
  source: 'single-user-default' | 'request';
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
  return {
    userId: cleanScopeValue(scope.userId, defaults.userId),
    workspaceId: cleanScopeValue(scope.workspaceId, defaults.workspaceId),
    runtimeMode: cleanScopeValue(scope.runtimeMode, defaults.runtimeMode) as RuntimeMode,
  };
}

export function createRequestScope(input: RequestScopeInput = {}): RequestScope {
  const runtimeMode = cleanScopeValue(input.runtimeMode, getRuntimeMode()) as RuntimeMode;
  return normalizeRequestScope(input, createDefaultRequestScope(runtimeMode));
}

function readHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function createRequestScopeFromHeaders(headers: HeaderMap = {}): RequestScope {
  return createRequestScope({
    userId: readHeaderValue(headers[SCOPE_HEADER_USER_ID]),
    workspaceId: readHeaderValue(headers[SCOPE_HEADER_WORKSPACE_ID]),
    runtimeMode: readHeaderValue(headers[SCOPE_HEADER_RUNTIME_MODE]),
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
    source:
      normalized.userId === DEFAULT_SCOPE_USER_ID && normalized.workspaceId === DEFAULT_SCOPE_WORKSPACE_ID
        ? 'single-user-default'
        : 'request',
  };
}
