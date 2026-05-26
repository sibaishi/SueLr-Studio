import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from '../../platform/logging/request-context.js';
import { createRequestScopeFromHeaders } from '../../platform/runtime/index.js';

export function requestContextMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  const scope = createRequestScopeFromHeaders(req.headers);
  const forwardedFor =
    typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : '';
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const clientIp = forwardedFor || req.ip || req.socket?.remoteAddress || '';
  res.setHeader('x-request-id', requestId);

  runWithRequestContext(
    {
      requestId,
      method: req.method,
      path: req.path,
      origin,
      userAgent,
      clientIp,
      scope,
    },
    () => {
      req.requestId = requestId;
      req.scope = scope;
      next();
    },
  );
}
