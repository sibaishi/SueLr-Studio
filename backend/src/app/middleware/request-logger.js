import { createLogger } from '../../platform/logging/logger.js';

const requestLogger = createLogger({ module: 'http' });

export function requestLoggerMiddleware(req, res, next) {
  const startedAt = Date.now();
  requestLogger.info('request started', {
    method: req.method,
    path: req.originalUrl,
  });

  res.on('finish', () => {
    requestLogger.info('request finished', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
