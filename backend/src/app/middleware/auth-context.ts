import { readSessionTokenFromRequest } from '../../modules/auth/auth.controller.ts';
import { type AuthenticatedUser, authService } from '../../modules/auth/auth.service.ts';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../../modules/types.ts';
import { getRuntimeMode } from '../../platform/runtime/index.ts';
import { UnauthorizedError } from '../errors/index.ts';

export const PUBLIC_MULTI_USER_PATHS = [
  '/api/health',
  '/api/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/capabilities/runtime',
  '/api/admin',
];

function isServerMultiUser(): boolean {
  return getRuntimeMode() === 'server-multi-user';
}

export function isPublicMultiUserPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return true;
  return PUBLIC_MULTI_USER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function authContextMiddleware(req: RequestLike, _res: ResponseLike, next: NextFunctionLike): void {
  const token = readSessionTokenFromRequest(req);
  const user = authService.authenticateSession(token);
  if (user) {
    req.auth = { user };
    req.scope = user.scope;
  }

  next();
}

export function requireAuthenticatedUser(req: RequestLike, _res: ResponseLike, next: NextFunctionLike): void {
  if (!isServerMultiUser()) {
    next();
    return;
  }

  const pathname = String(req.path || '');
  if (isPublicMultiUserPath(pathname)) {
    next();
    return;
  }

  if (req.auth?.user) {
    next();
    return;
  }

  next(new UnauthorizedError('AUTH_REQUIRED', '请先登录'));
}

export function getAuthenticatedUser(req: RequestLike): AuthenticatedUser | null {
  return req.auth?.user || null;
}
