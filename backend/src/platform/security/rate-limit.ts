import { createHash } from 'node:crypto';
import { AppError } from '../../app/errors/index.ts';

interface RateLimitRule {
  key: string;
  max: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map<string, RateLimitBucket>();

function getNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashFingerprint(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function nowMs(): number {
  return Date.now();
}

export function getClientIp(input: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const forwarded = String(input.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || String(input.ip || input.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

export function identityFingerprint(...parts: unknown[]): string {
  return hashFingerprint(parts.map((part) => String(part || '').trim().toLowerCase()).filter(Boolean).join('|') || 'empty');
}

export function enforceRateLimit(rule: RateLimitRule): void {
  const now = nowMs();
  const existing = buckets.get(rule.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(rule.key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (existing.count >= rule.max) {
    throw new AppError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试', {
      retryAfterMs: Math.max(0, existing.resetAt - now),
    });
  }

  existing.count += 1;
}

export function enforceAnyRateLimit(rules: RateLimitRule[]): void {
  for (const rule of rules) {
    enforceRateLimit(rule);
  }
}

export function getAuthRateLimitConfig() {
  return {
    registerMax: getNumberEnv('APP_RATE_LIMIT_REGISTER_MAX', 10),
    passwordResetMax: getNumberEnv('APP_RATE_LIMIT_PASSWORD_RESET_MAX', 5),
    loginFailureMax: getNumberEnv('APP_RATE_LIMIT_LOGIN_FAILURE_MAX', 5),
    windowMs: getNumberEnv('APP_RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  };
}

export function clearRateLimitBucketsForTests(): void {
  buckets.clear();
}
