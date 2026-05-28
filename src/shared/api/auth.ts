import { apiRequest, apiRequestOrThrow } from './client';

export type AuthUser = {
  id: string;
  username: string;
  email?: string;
  status?: 'pending' | 'active' | 'rejected' | 'disabled';
  workspaceId?: 'default';
};

export type AuthMePayload = {
  user: AuthUser;
};

export async function login(username: string, password: string) {
  return apiRequestOrThrow<{ user: AuthUser; session: { id: string; expiresAt: number } }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username: string, password: string, email?: string) {
  return apiRequestOrThrow<{ user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, email: email || undefined }),
  });
}

export async function logout() {
  return apiRequestOrThrow<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function loadCurrentUser() {
  const result = await apiRequest<AuthMePayload>('/api/auth/me');
  return result.success ? result.data?.user || null : null;
}
