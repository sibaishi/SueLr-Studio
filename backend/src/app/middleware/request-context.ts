import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from '../../platform/logging/request-context.ts';
import { createRequestScopeFromHeaders } from '../../platform/runtime/index.ts';
import type { RequestScope } from '../../platform/runtime/request-scope.ts';

type HeaderValue = string | string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type NextFunction = (error?: unknown) => void;

interface RequestContextRequest {
  headers: HeaderMap;
  method: string;
  path: string;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  requestId?: string;
  scope?: RequestScope;
}

interface RequestContextResponse {
  setHeader(name: string, value: number | string | readonly string[]): void;
}

function firstHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function requestContextMiddleware(
  req: RequestContextRequest,
  res: RequestContextResponse,
  next: NextFunction,
): void {
  const requestId = firstHeaderValue(req.headers['x-request-id']) || randomUUID();
  const scope = createRequestScopeFromHeaders(req.headers);
  const forwardedFor =
    typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : '';
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const clientIp = forwardedFor || req.ip || req.socket?.remoteAddress || '';
  res.setHeader('x-request-id', requestId);

  const context = {
    requestId,
    method: req.method,
    path: req.path,
    origin,
    userAgent,
    clientIp,
    scope,
  };

  runWithRequestContext(context, () => {
    req.requestId = requestId;
    req.scope = scope;
    next();
  });
}
