import { UnauthorizedError } from '../../app/errors/index.ts';
import { successEnvelope } from '../../app/http/envelope.ts';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { authService } from './auth.service.ts';

const SESSION_COOKIE_NAME = 'suelr_session';

function parseCookieHeader(header: unknown): Record<string, string> {
  const source = String(header || '');
  const result: Record<string, string> = {};
  for (const part of source.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key) continue;
    result[key] = decodeURIComponent(valueParts.join('=') || '');
  }
  return result;
}

export function readSessionTokenFromRequest(req: RequestLike): string {
  const cookies = parseCookieHeader(req.headers?.cookie);
  return cookies[SESSION_COOKIE_NAME] || '';
}

function buildSessionCookie(token: string, expiresAt: number): string {
  const secure =
    String(process.env.APP_PUBLIC_ORIGIN || '').startsWith('https://') || process.env.APP_COOKIE_SECURE === '1';
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export class AuthController {
  async login(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const result = await authService.login({
        ...req.body,
        userAgent: req.headers?.['user-agent'],
        clientIp: req.ip || req.socket?.remoteAddress,
      });
      res.setHeader('Set-Cookie', buildSessionCookie(result.sessionToken, result.session.expiresAt));
      res.json(
        successEnvelope({
          user: result.user,
          session: authService.getPublicSession(result.session),
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  me(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const user = req.auth?.user || authService.authenticateSession(readSessionTokenFromRequest(req));
      if (!user) throw new UnauthorizedError('AUTH_REQUIRED', '请先登录');
      res.json(successEnvelope({ user }));
    } catch (error) {
      next(error);
    }
  }

  logout(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      authService.logout(readSessionTokenFromRequest(req));
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      res.json(successEnvelope({ ok: true }));
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
