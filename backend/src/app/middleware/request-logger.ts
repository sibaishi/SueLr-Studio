import { createLogger } from '../../platform/logging/logger.ts';

type NextFunction = (error?: unknown) => void;

interface RequestLoggerRequest {
  method: string;
  originalUrl: string;
}

interface RequestLoggerResponse {
  statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
}

const requestLogger = createLogger({ module: 'http' });

export function requestLoggerMiddleware(
  req: RequestLoggerRequest,
  res: RequestLoggerResponse,
  next: NextFunction,
): void {
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
