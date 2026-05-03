import { BaseProviderAdapter } from '../base-adapter.js';

export class CompatibleProviderAdapter extends BaseProviderAdapter {
  normalizeResponse(response) {
    return response;
  }
}

export const compatibleProviderAdapter = new CompatibleProviderAdapter();
