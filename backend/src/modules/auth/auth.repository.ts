import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { STORAGE_PATHS, ensureJsonFile, readJsonFile, writeJsonFile } from '../../platform/storage/index.ts';
import type { PlainObject } from '../types.ts';

export interface StoredAuthUser {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  status: UserStatus;
  workspaceId: 'default';
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  disabledAt?: number;
}

export interface StoredAuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  userAgent: string;
  clientIp: string;
}

interface AuthState {
  users: StoredAuthUser[];
  sessions: StoredAuthSession[];
}

export type UserStatus = 'pending' | 'active' | 'rejected' | 'disabled';

const DEFAULT_AUTH_STATE: AuthState = {
  users: [],
  sessions: [],
};

function getAuthStatePath(): string {
  return path.join(STORAGE_PATHS.configDir, 'auth.json');
}

function sanitizeUserRecord(value: PlainObject): StoredAuthUser | null {
  const id = typeof value?.id === 'string' ? value.id : '';
  const username = typeof value?.username === 'string' ? value.username : '';
  const passwordHash = typeof value?.passwordHash === 'string' ? value.passwordHash : '';
  if (!id || !username || !passwordHash) return null;

  const rawStatus = String(value.status || '');
  const status = ['pending', 'active', 'rejected', 'disabled'].includes(rawStatus)
    ? (rawStatus as UserStatus)
    : 'active';

  return {
    id,
    username,
    email: typeof value.email === 'string' && value.email ? value.email : undefined,
    passwordHash,
    status,
    workspaceId: 'default',
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    approvedAt: Number(value.approvedAt) || undefined,
    rejectedAt: Number(value.rejectedAt) || undefined,
    disabledAt: Number(value.disabledAt) || undefined,
  };
}

function sanitizeAuthState(value: PlainObject): AuthState {
  return {
    users: Array.isArray(value?.users)
      ? (value.users.map((user) => sanitizeUserRecord(user as PlainObject)).filter(Boolean) as StoredAuthUser[])
      : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
  };
}

export class AuthRepository {
  readState(): AuthState {
    ensureJsonFile(getAuthStatePath(), DEFAULT_AUTH_STATE);
    return sanitizeAuthState(readJsonFile(getAuthStatePath(), DEFAULT_AUTH_STATE) as PlainObject);
  }

  writeState(state: AuthState): void {
    writeJsonFile(getAuthStatePath(), state);
  }

  listUsers(): StoredAuthUser[] {
    return this.readState().users;
  }

  findUserByUsername(username: string): StoredAuthUser | null {
    const normalized = username.trim().toLowerCase();
    return this.listUsers().find((user) => user.username.toLowerCase() === normalized) || null;
  }

  findUserByEmail(email: string): StoredAuthUser | null {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return this.listUsers().find((user) => user.email?.toLowerCase() === normalized) || null;
  }

  findUserById(userId: string): StoredAuthUser | null {
    return this.listUsers().find((user) => user.id === userId) || null;
  }

  upsertUser(input: { username: string; passwordHash: string; email?: string; status?: UserStatus }): StoredAuthUser {
    const state = this.readState();
    const now = Date.now();
    const existingIndex = state.users.findIndex((user) => user.username.toLowerCase() === input.username.toLowerCase());
    if (existingIndex >= 0) {
      const updated = {
        ...state.users[existingIndex],
        email: input.email ?? state.users[existingIndex].email,
        passwordHash: input.passwordHash,
        status: input.status || state.users[existingIndex].status || 'active',
        workspaceId: 'default' as const,
        updatedAt: now,
      };
      state.users[existingIndex] = updated;
      this.writeState(state);
      return updated;
    }

    const user = {
      id: `user_${randomUUID()}`,
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      status: input.status || 'active',
      workspaceId: 'default' as const,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(user);
    this.writeState(state);
    return user;
  }

  createUser(input: { username: string; passwordHash: string; email?: string; status: UserStatus }): StoredAuthUser {
    const state = this.readState();
    const now = Date.now();
    const user = {
      id: `user_${randomUUID()}`,
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      status: input.status,
      workspaceId: 'default' as const,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(user);
    this.writeState(state);
    return user;
  }

  updateUserStatus(username: string, status: UserStatus): StoredAuthUser {
    const state = this.readState();
    const normalized = username.trim().toLowerCase();
    const existingIndex = state.users.findIndex((user) => user.username.toLowerCase() === normalized);
    if (existingIndex < 0) throw new Error('AUTH_USER_NOT_FOUND');

    const now = Date.now();
    const updated = {
      ...state.users[existingIndex],
      status,
      workspaceId: 'default' as const,
      updatedAt: now,
      approvedAt: status === 'active' ? now : state.users[existingIndex].approvedAt,
      rejectedAt: status === 'rejected' ? now : state.users[existingIndex].rejectedAt,
      disabledAt: status === 'disabled' ? now : state.users[existingIndex].disabledAt,
    };
    state.users[existingIndex] = updated;
    this.writeState(state);
    return updated;
  }

  createSession(input: Omit<StoredAuthSession, 'id' | 'createdAt'>): StoredAuthSession {
    const state = this.readState();
    const now = Date.now();
    const session = {
      ...input,
      id: `session_${randomUUID()}`,
      createdAt: now,
    };
    state.sessions = state.sessions.filter((item) => item.expiresAt > now);
    state.sessions.push(session);
    this.writeState(state);
    return session;
  }

  findSessionByTokenHash(tokenHash: string): StoredAuthSession | null {
    const now = Date.now();
    return (
      this.readState().sessions.find((session) => session.tokenHash === tokenHash && session.expiresAt > now) || null
    );
  }

  deleteSessionByTokenHash(tokenHash: string): void {
    const state = this.readState();
    state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    this.writeState(state);
  }
}

export const authRepository = new AuthRepository();
