import { randomUUID } from 'crypto';
import { runWithRequestContext } from '../../platform/logging/request-context.js';

export function requestContextMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', requestId);

  runWithRequestContext({ requestId }, () => {
    req.requestId = requestId;
    next();
  });
}
