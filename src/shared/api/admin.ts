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
  email: {
    provider: 'none' | 'smtp';
    from: string;
    smtp: {
      hostSet: boolean;
      port: number;
      secure: boolean;
      userSet: boolean;
      passSet: boolean;
    };
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
  email?: {
    provider?: 'none' | 'smtp';
    from?: string;
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
    };
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

export type AdminDeleteUserPayload = {
  deletedUser: AdminUser;
  deleted: {
    sessions: number;
    passwordResetRequests: number;
    workflows: number;
    records: number;
    scopedStorage: boolean;
  };
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
  notification?: EmailSendResult;
};

export type EmailSendResult = {
  ok: boolean;
  status: 'disabled' | 'sent' | 'failed';
  message: string;
  error?: string;
};

export type LegacyMigrationCounts = {
  workflows: number;
  conversations: number;
  gallery: number;
  videos: number;
  agentMemories: number;
  generatedFiles: number;
  uploads: number;
};

export type LegacyMigrationSummary = {
  counts: LegacyMigrationCounts;
};

export type LegacyMigrationDryRun = LegacyMigrationSummary & {
  targetUser: {
    id: string;
    username: string;
    workspaceId: string;
  };
  destinationNamespace: string;
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

export async function testAdminEmail(accessKey: string | undefined, to: string) {
  return apiRequest('/api/admin/email/test', {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ to }),
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

export async function deleteAdminUser(userId: string, accessKey: string | undefined, confirmAccessKey: string) {
  return apiRequestOrThrow<AdminDeleteUserPayload>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ confirmAccessKey }),
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

export async function loadLegacyMigrationSummary(accessKey?: string) {
  return apiRequestOrThrow<LegacyMigrationSummary>('/api/admin/legacy-data/summary', {
    headers: buildAdminHeaders(accessKey),
  });
}

export async function dryRunLegacyMigration(targetUserId: string, accessKey?: string) {
  return apiRequestOrThrow<LegacyMigrationDryRun>('/api/admin/legacy-data/dry-run', {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ targetUserId }),
  });
}

export async function migrateLegacyData(targetUserId: string, accessKey?: string) {
  return apiRequestOrThrow<{ manifestPath: string; countsAfter: LegacyMigrationCounts }>('/api/admin/legacy-data/migrate', {
    method: 'POST',
    headers: buildAdminHeaders(accessKey),
    body: JSON.stringify({ targetUserId }),
  });
}
