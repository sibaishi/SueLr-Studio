import { ApiError, getApiErrorMessage, toApiError } from './errors';
import type { ApiEnvelope, ApiErrorPayload, ApiResult } from './types';

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  skipJsonContentType?: boolean;
};

function buildUrl(path: string) {
  return path.startsWith('http://') || path.startsWith('https://') ? path : path;
}

function parseJsonText<T>(text: string): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function summarizeResponseText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '空响应';
  return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
}

function buildNonJsonResponseError(path: string, response: Response, responseText: string): string {
  const contentType = response.headers.get('content-type') || '未知内容类型';
  return `接口返回了非 JSON 响应（HTTP ${response.status}，${path}，${contentType}）：${summarizeResponseText(responseText)}`;
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

    const responseText = await response.text().catch(() => '');
    const payload = parseJsonText<ApiEnvelope<T>>(responseText);

    if (!response.ok) {
      if (payload) {
        const normalized = normalizeEnvelope(payload);
        return {
          ...normalized,
          success: false,
          error: normalized.error || `HTTP ${response.status}`,
          status: response.status,
        };
      }
      return {
        success: false,
        error: buildNonJsonResponseError(path, response, responseText),
        status: response.status,
      };
    }

    if (!payload) {
      return {
        success: false,
        error: buildNonJsonResponseError(path, response, responseText),
        status: response.status,
      };
    }

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
  const responseText = await response.text().catch(() => '');
  return parseJsonText<ApiEnvelope<T>>(responseText);
}
