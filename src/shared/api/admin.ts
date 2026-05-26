import { apiRequest, apiRequestOrThrow } from './client';

export type AdminAccessValidationResult = {
  valid: boolean;
  requiresAccessKey: boolean;
};

export type AdminSettingsPayload = {
  version: number;
  search: {
    enabled: boolean;
    provider: string;
    providerConfig: {
      tavilyApiKey?: string;
      tavilyApiKeySet?: boolean;
    };
  };
  network: {
    outboundProxy: {
      mode: 'system' | 'direct' | 'custom';
      httpProxySet: boolean;
      httpsProxySet: boolean;
      noProxy: string;
    };
  };
  features: {
    adminConsoleEnabled: boolean;
  };
};

export type AdminSettingsPatch = {
  search?: {
    enabled?: boolean;
    provider?: string;
    providerConfig?: {
      tavilyApiKey?: string;
    };
  };
  network?: {
    outboundProxy?: {
      mode?: 'system' | 'direct' | 'custom';
      httpProxy?: string;
      httpsProxy?: string;
      noProxy?: string;
    };
  };
  features?: {
    adminConsoleEnabled?: boolean;
  };
};

function buildAdminHeaders(accessKey?: string): HeadersInit | undefined {
  if (!accessKey) return undefined;
  return { 'X-Admin-Access-Key': accessKey };
}

export async function validateAdminAccess(accessKey?: string) {
  return apiRequestOrThrow<AdminAccessValidationResult>('/api/admin/access/validate', {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ accessKey }),
  });
}

export async function loadAdminSettings(accessKey?: string) {
  return apiRequestOrThrow<AdminSettingsPayload>('/api/admin/settings', {
    headers: buildAdminHeaders(accessKey),
  });
}

export async function saveAdminSettings(patch: AdminSettingsPatch, accessKey?: string) {
  return apiRequestOrThrow<AdminSettingsPayload>('/api/admin/settings', {
    method: 'PUT',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify(patch),
  });
}

export async function testAdminSearch(accessKey?: string, query = 'AI 最新资讯') {
  return apiRequest('/api/admin/search/test', {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ query, maxResults: 3 }),
  });
}
