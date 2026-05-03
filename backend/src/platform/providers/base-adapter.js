import { ProviderError } from '../../app/errors/index.js';

export class BaseProviderAdapter {
  buildEndpoint(baseUrl, endpoint) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!endpoint) return base;
    if (/\/v\d+$/.test(base) && /^\/v\d+\//.test(endpoint)) {
      return base + endpoint.replace(/^\/v\d+/, '');
    }
    return base + endpoint;
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
