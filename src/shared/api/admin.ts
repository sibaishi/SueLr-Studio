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

export type AdminUserStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export type AdminUser = {
  id: string;
  username: string;
  email?: string;
  status: AdminUserStatus;
  workspaceId: 'default';
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  disabledAt?: number;
};

export type AdminUsersPayload = {
  users: AdminUser[];
};

export type AdminUserPayload = {
  user: AdminUser;
};

export type PasswordResetRequest = {
  id: string;
  userId: string;
  username: string;
  email?: string;
  status: 'pending' | 'issued' | 'used' | 'revoked' | 'expired';
  expiresAt?: number;
  createdAt: number;
  issuedAt?: number;
  usedAt?: number;
  revokedAt?: number;
};

export type PasswordResetRequestsPayload = {
  requests: PasswordResetRequest[];
};

export type PasswordResetIssuePayload = {
  request: PasswordResetRequest;
  token?: string;
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

export async function loadAdminUsers(accessKey?: string, status?: AdminUserStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequestOrThrow<AdminUsersPayload>(`/api/admin/users${query}`, {
    headers: buildAdminHeaders(accessKey),
  });
}

export async function approveAdminUser(userId: string, accessKey?: string) {
  return apiRequestOrThrow<AdminUserPayload>(`/api/admin/users/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
  });
}

export async function rejectAdminUser(userId: string, accessKey?: string) {
  return apiRequestOrThrow<AdminUserPayload>(`/api/admin/users/${encodeURIComponent(userId)}/reject`, {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
  });
}

export async function disableAdminUser(userId: string, accessKey?: string) {
  return apiRequestOrThrow<AdminUserPayload>(`/api/admin/users/${encodeURIComponent(userId)}/disable`, {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
  });
}

export async function enableAdminUser(userId: string, accessKey?: string) {
  return apiRequestOrThrow<AdminUserPayload>(`/api/admin/users/${encodeURIComponent(userId)}/enable`, {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
  });
}

export async function loadPasswordResetRequests(accessKey?: string) {
  return apiRequestOrThrow<PasswordResetRequestsPayload>('/api/admin/password-reset-requests', {
    headers: buildAdminHeaders(accessKey),
  });
}

export async function issuePasswordResetRequest(requestId: string, accessKey?: string) {
  return apiRequestOrThrow<PasswordResetIssuePayload>(
    `/api/admin/password-reset-requests/${encodeURIComponent(requestId)}/issue`,
    {
      method: 'POST',
      headers: buildAdminHeaders(accessKey),
    },
  );
}

export async function revokePasswordResetRequest(requestId: string, accessKey?: string) {
  return apiRequestOrThrow<{ request: PasswordResetRequest }>(
    `/api/admin/password-reset-requests/${encodeURIComponent(requestId)}/revoke`,
    {
      method: 'POST',
      headers: buildAdminHeaders(accessKey),
    },
  );
}
