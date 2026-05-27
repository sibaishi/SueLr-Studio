import { BaseProviderAdapter } from '../base-adapter.js';

export class CompatibleProviderAdapter extends BaseProviderAdapter {
  normalizeResponse<T>(response: T): T {
    return response;
  }
}

export const compatibleProviderAdapter = new CompatibleProviderAdapter();
