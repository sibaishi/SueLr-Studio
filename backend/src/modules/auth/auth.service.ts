import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { UnauthorizedError, ValidationError } from '../../app/errors/index.ts';
import { getRuntimeMode } from '../../platform/runtime/index.ts';
import type { PlainObject } from '../types.ts';
import { type AuthRepository, type StoredAuthSession, type StoredAuthUser, authRepository } from './auth.repository.ts';
import type { LoginInput } from './auth.schema.ts';

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = 'scrypt';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicAuthUser {
  id: string;
  username: string;
}

export interface AuthenticatedUser extends PublicAuthUser {
  scope: {
    userId: string;
    workspaceId: string;
    runtimeMode: string;
  };
}

function cleanString(value: unknown, maxLength = 500): string {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string, salt = randomBytes(16).toString('base64url')): Promise<string> {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [prefix, salt, hash] = storedHash.split(':');
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !hash) return false;
  const candidate = await hashPassword(password, salt);
  const candidateHash = Buffer.from(candidate.split(':')[2] || '', 'base64url');
  const stored = Buffer.from(hash, 'base64url');
  return candidateHash.length === stored.length && timingSafeEqual(candidateHash, stored);
}

function toPublicUser(user: StoredAuthUser, runtimeMode = getRuntimeMode()): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    scope: {
      userId: user.id,
      workspaceId: 'default',
      runtimeMode,
    },
  };
}

export class AuthService {
  repository: AuthRepository;

  constructor(repository = authRepository) {
    this.repository = repository;
  }

  async ensureBootstrapUser(): Promise<StoredAuthUser | null> {
    const username = cleanString(process.env.APP_AUTH_BOOTSTRAP_USERNAME, 120);
    const password = String(process.env.APP_AUTH_BOOTSTRAP_PASSWORD || '');
    if (!username && !password) return null;
    if (!username || !password) {
      throw new ValidationError('AUTH_BOOTSTRAP_INVALID', '认证引导账号需要同时配置用户名和密码');
    }
    const existing = this.repository.findUserByUsername(username);
    if (existing) return existing;
    return this.repository.upsertUser({
      username,
      passwordHash: await hashPassword(password),
    });
  }

  async login(input: Partial<LoginInput> & PlainObject = {}) {
    await this.ensureBootstrapUser();
    const username = cleanString(input.username, 120);
    const password = String(input.password || '');
    const user = this.repository.findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError('AUTH_INVALID_CREDENTIALS', '用户名或密码无效');
    }

    const sessionToken = createSessionToken();
    const session = this.repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: Date.now() + SESSION_TTL_MS,
      userAgent: cleanString(input.userAgent, 500),
      clientIp: cleanString(input.clientIp, 120),
    });

    return {
      user: toPublicUser(user),
      session,
      sessionToken,
    };
  }

  authenticateSession(sessionToken: string): AuthenticatedUser | null {
    const token = cleanString(sessionToken, 500);
    if (!token) return null;
    const session = this.repository.findSessionByTokenHash(hashSessionToken(token));
    if (!session) return null;
    const user = this.repository.findUserById(session.userId);
    return user ? toPublicUser(user) : null;
  }

  logout(sessionToken: string): void {
    const token = cleanString(sessionToken, 500);
    if (!token) return;
    this.repository.deleteSessionByTokenHash(hashSessionToken(token));
  }

  getPublicSession(session: StoredAuthSession) {
    return {
      id: session.id,
      expiresAt: session.expiresAt,
    };
  }
}

export const authService = new AuthService();
