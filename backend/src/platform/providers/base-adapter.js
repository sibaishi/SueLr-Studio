import { ProviderError } from '../../app/errors/index.js';

export class BaseProviderAdapter {
  buildEndpoint(baseUrl, endpoint) {
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

  buildHeaders(apiKey, providerConfig = {}) {
    const key = String(apiKey || '').replace(/[^\x20-\x7E]/g, '').trim();
    const headers = { 'Content-Type': 'application/json' };

    switch (providerConfig.authType) {
      case 'api-key':
        headers['X-API-Key'] = key;
        break;
      case 'custom':
        headers[providerConfig.customHeaderName || 'Authorization'] = `${providerConfig.customPrefix ?? 'Bearer '}${key}`;
        break;
      default:
        headers.Authorization = `Bearer ${key}`;
        break;
    }

    return headers;
  }

  buildJsonRequest({ apiKey, providerConfig, baseUrl, endpoint, method = 'POST', body, signal }) {
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

  buildRawRequest({ apiKey, providerConfig, baseUrl, endpoint, method = 'GET', headers = {}, body, signal }) {
    return {
      url: this.buildEndpoint(baseUrl, endpoint),
      options: {
        method,
        headers: {
          ...this.buildHeaders(apiKey, providerConfig),
          ...headers,
        },
        ...(signal ? { signal } : {}),
        ...(body !== undefined ? { body } : {}),
      },
    };
  }

  normalizeError(error, fallbackCode = 'PROVIDER_REQUEST_FAILED') {
    if (error?.status) return error;
    return new ProviderError(fallbackCode, error instanceof Error ? error.message : '上游 Provider 请求失败', undefined, error);
  }
}
