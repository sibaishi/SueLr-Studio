import { BaseProviderAdapter } from '../base-adapter.ts';

export class CompatibleProviderAdapter extends BaseProviderAdapter {
  normalizeResponse<T>(response: T): T {
    return response;
  }
}

export const compatibleProviderAdapter = new CompatibleProviderAdapter();
