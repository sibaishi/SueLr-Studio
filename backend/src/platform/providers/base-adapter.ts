import { ProviderError } from '../../app/errors/index.ts';

const ProviderErrorCtor = ProviderError as new (
  code: string,
  message: string,
  details?: unknown,
  cause?: unknown,
) => ProviderError;

export type ProviderAuthType = 'api-key' | 'custom' | 'bearer' | string;
export type ProviderHeaders = Record<string, string>;

export interface ProviderConfig {
  authType?: ProviderAuthType;
  customHeaderName?: string;
  customPrefix?: string;
  [key: string]: unknown;
}

export interface ProviderRequestInput {
  apiKey?: unknown;
  providerConfig?: ProviderConfig;
  baseUrl: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ProviderRawRequestInput extends ProviderRequestInput {
  headers?: ProviderHeaders;
}

export interface ProviderRequestResult {
  url: string;
  options: RequestInit & { headers: ProviderHeaders };
}

export class BaseProviderAdapter {
  buildEndpoint(baseUrl: string, endpoint?: string): string {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!endpoint) return base;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;

    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const baseApiVersion = base.match(/\/api\/v\d+[a-z0-9-]*$/i);
    if (baseApiVersion && /^\/v\d+[a-z0-9-]*(?=\/)/i.test(normalizedEndpoint)) {
      return base + normalizedEndpoint.replace(/^\/v\d+[a-z0-9-]*/i, '');
    }

    const baseVersion = base.match(/\/v\d+[a-z0-9-]*$/i);
    if (baseVersion && /^\/v\d+[a-z0-9-]*(?=\/)/i.test(normalizedEndpoint)) {
      return base.slice(0, -baseVersion[0].length) + normalizedEndpoint;
    }
    return base + normalizedEndpoint;
  }

  buildHeaders(apiKey: unknown, providerConfig: ProviderConfig = {}): ProviderHeaders {
    const key = String(apiKey || '')
      .replace(/[^\x20-\x7E]/g, '')
      .trim();
    const headers: ProviderHeaders = { 'Content-Type': 'application/json' };

    switch (providerConfig.authType) {
      case 'api-key':
        headers['X-API-Key'] = key;
        break;
      case 'custom':
        headers[providerConfig.customHeaderName || 'Authorization'] =
          `${providerConfig.customPrefix ?? 'Bearer '}${key}`;
        break;
      default:
        headers.Authorization = `Bearer ${key}`;
        break;
    }

    return headers;
  }

  buildJsonRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint,
    method = 'POST',
    body,
    signal,
  }: ProviderRequestInput): ProviderRequestResult {
    return {
      url: this.buildEndpoint(baseUrl, endpoint),
      options: {
        method,
        headers: this.buildHeaders(apiKey, providerConfig),
        ...(signal ? { signal } : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
    };
  }

  buildRawRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint,
    method = 'GET',
    headers = {},
    body,
    signal,
  }: ProviderRawRequestInput): ProviderRequestResult {
    return {
      url: this.buildEndpoint(baseUrl, endpoint),
      options: {
        method,
        headers: {
          ...this.buildHeaders(apiKey, providerConfig),
          ...headers,
        },
        ...(signal ? { signal } : {}),
        ...(body !== undefined ? { body: body as BodyInit } : {}),
      },
    };
  }

  normalizeError(error: unknown, fallbackCode = 'PROVIDER_REQUEST_FAILED'): unknown {
    if (error && typeof error === 'object' && 'status' in error) return error;
    return new ProviderErrorCtor(
      fallbackCode,
      error instanceof Error ? error.message : '上游 Provider 请求失败',
      undefined,
      error,
    );
  }
}
