import { ApiError, getApiErrorMessage, toApiError } from './errors';
import type { ApiEnvelope, ApiErrorPayload, ApiResult } from './types';

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  skipJsonContentType?: boolean;
};

const AUTH_INVALIDATED_EVENT = 'suelr-auth-invalidated';

export function notifyAuthInvalidated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT));
}

export function subscribeAuthInvalidated(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AUTH_INVALIDATED_EVENT, listener);
  return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, listener);
}

function buildUrl(path: string) {
  return path.startsWith('http://') || path.startsWith('https://') ? path : path;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function parseJsonText<T>(text: string): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function extractErrorPayload(error: ApiEnvelope<unknown>['error']): ApiErrorPayload | undefined {
  return error && typeof error === 'object' ? error : undefined;
}

export function normalizeEnvelope<T>(payload: ApiEnvelope<T> | null): ApiResult<T> {
  if (!payload || typeof payload.success !== 'boolean') {
    return { success: false, error: '响应解析失败' };
  }

  const errorPayload = extractErrorPayload(payload.error);

  return {
    success: payload.success,
    data: payload.data,
    error: payload.success ? undefined : getApiErrorMessage(payload.error, '请求失败'),
    errorCode: payload.success ? undefined : errorPayload?.code,
    errorDetails: payload.success ? undefined : errorPayload?.details,
  };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { timeoutMs, skipJsonContentType, headers, ...rest } = options;

  try {
    const response = await fetch(buildUrl(path), {
      ...rest,
      headers: {
        ...(skipJsonContentType ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      signal: rest.signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      const payload = parseJsonText<ApiEnvelope<T>>(responseText);
      if (payload) {
        const normalized = normalizeEnvelope(payload);
        if (response.status === 401 && normalized.errorCode === 'AUTH_REQUIRED') {
          notifyAuthInvalidated();
        }
        return {
          ...normalized,
          success: false,
          error: normalized.error || `HTTP ${response.status}`,
          status: response.status,
        };
      }
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText || '未知错误'}`,
        status: response.status,
      };
    }

    const payload = await parseJson<ApiEnvelope<T>>(response);
    return { ...normalizeEnvelope(payload), status: response.status };
  } catch (error) {
    const apiError = toApiError(error, '网络请求失败');
    return {
      success: false,
      error: apiError.message,
      errorCode: apiError.code,
      errorDetails: apiError.details,
      status: apiError.status,
    };
  }
}

export async function apiRequestOrThrow<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await apiRequest<T>(path, options);
  if (!result.success) {
    throw new ApiError(result.error || '请求失败', result.status, result.errorCode, result.errorDetails);
  }
  return result.data as T;
}

export async function parseEnvelopeResponse<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  return parseJson<ApiEnvelope<T>>(response);
}
