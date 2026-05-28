import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../app/errors/index.ts';
import { auditLog } from '../../platform/audit/audit-log.ts';
import { emailService, type EmailSendResult } from '../../platform/notifications/email.service.ts';
import { getRuntimeMode } from '../../platform/runtime/index.ts';
import {
  enforceAnyRateLimit,
  getAuthRateLimitConfig,
  identityFingerprint,
} from '../../platform/security/rate-limit.ts';
import { adminConfigRepository } from '../admin-config/admin-config.repository.ts';
import type { PlainObject } from '../types.ts';
import {
  type AuthRepository,
  type StoredAuthSession,
  type StoredAuthUser,
  type StoredPasswordResetRequest,
  authRepository,
} from './auth.repository.ts';
import type { LoginInput, PasswordResetCompleteInput, PasswordResetRequestInput, RegisterInput } from './auth.schema.ts';

emailService.setConfigProvider(() => adminConfigRepository.buildEmailConfig(adminConfigRepository.readAdminConfig()));

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = 'scrypt';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface PublicAuthUser {
  id: string;
  username: string;
  email?: string;
  status: string;
  workspaceId: 'default';
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

function createResetToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(`reset:${token}`).digest('hex');
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
  const workspaceId = user.workspaceId || 'default';
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    status: user.status,
    workspaceId,
    scope: {
      userId: user.id,
      workspaceId,
      runtimeMode,
    },
  };
}

function assertCanLogin(user: StoredAuthUser): void {
  if (user.status === 'active') return;
  if (user.status === 'pending') throw new UnauthorizedError('AUTH_USER_PENDING', '账号正在等待管理员审核');
  if (user.status === 'rejected') throw new UnauthorizedError('AUTH_USER_REJECTED', '账号申请已被拒绝');
  if (user.status === 'disabled') throw new UnauthorizedError('AUTH_USER_DISABLED', '账号已被停用');
  throw new UnauthorizedError('AUTH_USER_NOT_ACTIVE', '账号不可登录');
}

function toPublicResetRequest(request: StoredPasswordResetRequest) {
  return {
    id: request.id,
    userId: request.userId,
    username: request.username,
    email: request.email,
    status: request.status,
    expiresAt: request.expiresAt,
    createdAt: request.createdAt,
    issuedAt: request.issuedAt,
    usedAt: request.usedAt,
    revokedAt: request.revokedAt,
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
      status: 'active',
    });
  }

  async register(input: Partial<RegisterInput> & PlainObject = {}) {
    const username = cleanString(input.username, 120);
    const email = cleanString(input.email, 320).toLowerCase() || undefined;
    const limitConfig = getAuthRateLimitConfig();
    enforceAnyRateLimit([
      {
        key: `auth:register:ip:${identityFingerprint(input.clientIp)}`,
        max: limitConfig.registerMax,
        windowMs: limitConfig.windowMs,
      },
      {
        key: `auth:register:identity:${identityFingerprint(username, email)}`,
        max: limitConfig.registerMax,
        windowMs: limitConfig.windowMs,
      },
    ]);
    if (this.repository.findUserByUsername(username)) {
      throw new ConflictError('AUTH_USERNAME_TAKEN', '用户名已被占用');
    }
    if (email && this.repository.findUserByEmail(email)) {
      throw new ConflictError('AUTH_EMAIL_TAKEN', '邮箱已被占用');
    }

    const user = this.repository.createUser({
      username,
      email,
      passwordHash: await hashPassword(String(input.password || '')),
      status: 'pending',
    });

    const notification = await this.sendOptionalEmail({
      to: user.email,
      subject: 'SueLr Studio 注册申请已提交',
      text: `你的 SueLr Studio 账号 ${user.username} 已提交注册申请，请等待管理员审核。`,
    });
    auditLog.write({
      action: 'auth.registration.submitted',
      actorType: 'public',
      targetType: 'user',
      targetId: user.id,
      clientIp: cleanString(input.clientIp, 120),
      userAgent: cleanString(input.userAgent, 500),
      details: { username: user.username, email: user.email, notificationStatus: notification.status },
    });
    this.auditEmailFailure(notification, 'auth.registration.email_failed', {
      userId: user.id,
      username: user.username,
    });

    return { user: toPublicUser(user), notification };
  }

  requestPasswordReset(input: Partial<PasswordResetRequestInput> & PlainObject = {}) {
    const identity = cleanString(input.usernameOrEmail, 320).toLowerCase();
    const limitConfig = getAuthRateLimitConfig();
    enforceAnyRateLimit([
      {
        key: `auth:password-reset:ip:${identityFingerprint(input.clientIp)}`,
        max: limitConfig.passwordResetMax,
        windowMs: limitConfig.windowMs,
      },
      {
        key: `auth:password-reset:identity:${identityFingerprint(identity)}`,
        max: limitConfig.passwordResetMax,
        windowMs: limitConfig.windowMs,
      },
    ]);
    const user = identity.includes('@')
      ? this.repository.findUserByEmail(identity)
      : this.repository.findUserByUsername(identity);
    if (!user) {
      throw new NotFoundError('AUTH_RESET_USER_NOT_FOUND', '账号不存在');
    }

    const request = this.repository.createPasswordResetRequest({
      userId: user.id,
      username: user.username,
      email: user.email,
    });
    auditLog.write({
      action: 'auth.password_reset.requested',
      actorType: 'public',
      targetType: 'password_reset_request',
      targetId: request.id,
      clientIp: cleanString(input.clientIp, 120),
      userAgent: cleanString(input.userAgent, 500),
      details: { userId: user.id, username: user.username },
    });
    return { request: toPublicResetRequest(request) };
  }

  listPasswordResetRequests() {
    return {
      requests: this.repository.listPasswordResetRequests().map(toPublicResetRequest),
    };
  }

  async issuePasswordResetToken(requestId: string) {
    const request = this.repository.findPasswordResetRequestById(requestId);
    if (!request) throw new NotFoundError('AUTH_RESET_REQUEST_NOT_FOUND', '重置申请不存在');
    if (request.status === 'used' || request.status === 'revoked') {
      throw new ValidationError('AUTH_RESET_REQUEST_CLOSED', '重置申请已关闭');
    }

    const token = createResetToken();
    const updated = this.repository.updatePasswordResetRequest(requestId, {
      status: 'issued',
      tokenHash: hashResetToken(token),
      expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
      issuedAt: Date.now(),
    });
    if (!updated) throw new NotFoundError('AUTH_RESET_REQUEST_NOT_FOUND', '重置申请不存在');
    const notification = await this.sendOptionalEmail({
      to: updated.email,
      subject: 'SueLr Studio 密码重置 token',
      text: `你的 SueLr Studio 密码重置 token 是：${token}\n该 token 将在 1 小时后过期，且只能使用一次。`,
    });
    auditLog.write({
      action: 'admin.password_reset.token_issued',
      actorType: 'admin',
      targetType: 'password_reset_request',
      targetId: updated.id,
      details: { userId: updated.userId, username: updated.username, notificationStatus: notification.status },
    });
    this.auditEmailFailure(notification, 'admin.password_reset.email_failed', {
      requestId: updated.id,
      userId: updated.userId,
      username: updated.username,
    });
    return { request: toPublicResetRequest(updated), token, notification };
  }

  revokePasswordResetToken(requestId: string) {
    const updated = this.repository.updatePasswordResetRequest(requestId, {
      status: 'revoked',
      tokenHash: undefined,
      revokedAt: Date.now(),
    });
    if (!updated) throw new NotFoundError('AUTH_RESET_REQUEST_NOT_FOUND', '重置申请不存在');
    auditLog.write({
      action: 'admin.password_reset.token_revoked',
      actorType: 'admin',
      targetType: 'password_reset_request',
      targetId: updated.id,
      details: { userId: updated.userId, username: updated.username },
    });
    return { request: toPublicResetRequest(updated) };
  }

  async completePasswordReset(input: Partial<PasswordResetCompleteInput> & PlainObject = {}) {
    const token = cleanString(input.token, 500);
    const request = this.repository.findPasswordResetRequestByTokenHash(hashResetToken(token));
    if (!request || request.status !== 'issued' || !request.expiresAt || request.expiresAt <= Date.now()) {
      if (request?.expiresAt && request.expiresAt <= Date.now()) {
        this.repository.updatePasswordResetRequest(request.id, { status: 'expired', tokenHash: undefined });
      }
      throw new ValidationError('AUTH_RESET_TOKEN_INVALID', '重置 token 无效或已过期');
    }

    const user = this.repository.updateUserPasswordHash(request.userId, await hashPassword(String(input.password || '')));
    if (!user) throw new NotFoundError('AUTH_RESET_USER_NOT_FOUND', '账号不存在');
    this.repository.updatePasswordResetRequest(request.id, {
      status: 'used',
      tokenHash: undefined,
      usedAt: Date.now(),
    });
    auditLog.write({
      action: 'auth.password_reset.token_used',
      actorType: 'public',
      targetType: 'password_reset_request',
      targetId: request.id,
      details: { userId: user.id, username: user.username },
    });
    return { ok: true };
  }

  async login(input: Partial<LoginInput> & PlainObject = {}) {
    await this.ensureBootstrapUser();
    const username = cleanString(input.username, 120);
    const password = String(input.password || '');
    const user = this.repository.findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      const limitConfig = getAuthRateLimitConfig();
      enforceAnyRateLimit([
        {
          key: `auth:login-failure:ip:${identityFingerprint(input.clientIp)}`,
          max: limitConfig.loginFailureMax,
          windowMs: limitConfig.windowMs,
        },
        {
          key: `auth:login-failure:identity:${identityFingerprint(username)}`,
          max: limitConfig.loginFailureMax,
          windowMs: limitConfig.windowMs,
        },
      ]);
      throw new UnauthorizedError('AUTH_INVALID_CREDENTIALS', '用户名或密码无效');
    }
    assertCanLogin(user);

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

  async sendUserApprovedEmail(userId: string): Promise<EmailSendResult> {
    const user = this.repository.findUserById(userId);
    return await this.sendOptionalEmail({
      to: user?.email,
      subject: 'SueLr Studio 注册申请已通过',
      text: `你的 SueLr Studio 账号 ${user?.username || 'unknown'} 已通过审核，现在可以登录。`,
    });
  }

  private async sendOptionalEmail(message: { to?: string; subject: string; text: string }): Promise<EmailSendResult> {
    return await emailService.send(message);
  }

  private auditEmailFailure(notification: EmailSendResult, sourceAction: string, details: PlainObject): void {
    if (notification.status !== 'failed') return;
    auditLog.write({
      action: 'notification.email.failed',
      actorType: 'system',
      targetType: 'email',
      details: { ...details, sourceAction, message: notification.message },
    });
  }
}

export const authService = new AuthService();
