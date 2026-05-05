import { ProviderError } from '../../../app/errors/index.js';
import { CompatibleProviderAdapter } from './compatible-adapter.js';
import { proxyAwareFetch } from '../../http/proxy-aware-fetch.js';
import { parseProviderErrorResponse, toProviderError } from '../provider-http.js';
import { assertSafeProviderBaseUrl } from '../../security/network-guards.js';

export class CompatibleHttpAdapter extends CompatibleProviderAdapter {
  async jsonRequest({ apiKey, providerConfig, baseUrl, endpoint, method = 'POST', body, signal, errorCode = 'PROVIDER_REQUEST_FAILED' }) {
    await assertSafeProviderBaseUrl(baseUrl, 'Base URL');
    const request = this.buildJsonRequest({ apiKey, providerConfig, baseUrl, endpoint, method, body, signal });

    let response;
    try {
      response = await proxyAwareFetch(request.url, request.options);
    } catch (error) {
      throw toProviderError(error, errorCode, request.url);
    }

    if (!response.ok) {
      throw new ProviderError(errorCode, await parseProviderErrorResponse(response, '上游 API 调用失败'));
    }

    return response;
  }

  async rawRequest({ apiKey, providerConfig, baseUrl, endpoint, method = 'GET', headers = {}, body, signal, errorCode = 'PROVIDER_REQUEST_FAILED' }) {
    await assertSafeProviderBaseUrl(baseUrl, 'Base URL');
    const request = this.buildRawRequest({ apiKey, providerConfig, baseUrl, endpoint, method, headers, body, signal });

    let response;
    try {
      response = await proxyAwareFetch(request.url, request.options);
    } catch (error) {
      throw toProviderError(error, errorCode, request.url);
    }

    return response;
  }
}

export const compatibleHttpAdapter = new CompatibleHttpAdapter();
