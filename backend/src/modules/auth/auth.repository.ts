import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { STORAGE_PATHS, ensureJsonFile, readJsonFile, writeJsonFile } from '../../platform/storage/index.ts';
import type { PlainObject } from '../types.ts';

export interface StoredAuthUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
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

const DEFAULT_AUTH_STATE: AuthState = {
  users: [],
  sessions: [],
};

function getAuthStatePath(): string {
  return path.join(STORAGE_PATHS.configDir, 'auth.json');
}

function sanitizeAuthState(value: PlainObject): AuthState {
  return {
    users: Array.isArray(value?.users) ? value.users : [],
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

  findUserById(userId: string): StoredAuthUser | null {
    return this.listUsers().find((user) => user.id === userId) || null;
  }

  upsertUser(input: { username: string; passwordHash: string }): StoredAuthUser {
    const state = this.readState();
    const now = Date.now();
    const existingIndex = state.users.findIndex((user) => user.username.toLowerCase() === input.username.toLowerCase());
    if (existingIndex >= 0) {
      const updated = {
        ...state.users[existingIndex],
        passwordHash: input.passwordHash,
        updatedAt: now,
      };
      state.users[existingIndex] = updated;
      this.writeState(state);
      return updated;
    }

    const user = {
      id: `user_${randomUUID()}`,
      username: input.username,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(user);
    this.writeState(state);
    return user;
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
