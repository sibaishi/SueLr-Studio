import { createLogger } from '../../platform/logging/logger.ts';
import { errorEnvelope } from '../http/envelope.ts';

const errorLogger = createLogger({ module: 'error-handler' });
const EXPOSE_DETAILS = process.env.APP_EXPOSE_ERROR_DETAILS === 'true';

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
  stack?: unknown;
}

interface ClientError {
  code: string;
  message: string;
  details?: unknown;
}

interface ResponseLike {
  status(code: number): {
    json(payload: unknown): unknown;
  };
}

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? (error as ErrorLike) : {};
}

function toSafeClientError(error: ErrorLike, status: number): ClientError {
  const code = (typeof error.code === 'string' && error.code) || 'INTERNAL_ERROR';

  if (status >= 500) {
    return {
      code,
      message: status === 502 ? '上游服务请求失败，请检查配置或稍后重试' : '服务器内部错误，请稍后重试',
    };
  }

  const normalized: ClientError = {
    code,
    message: (typeof error.message === 'string' && error.message) || '请求处理失败',
  };

  if (EXPOSE_DETAILS && error.details !== undefined) {
    normalized.details = error.details;
  }

  return normalized;
}

export function errorHandler(error: unknown, _req: unknown, res: ResponseLike, _next: unknown): void {
  const errorLike = asErrorLike(error);
  const status = Number(errorLike.status) || 500;
  const normalized = toSafeClientError(errorLike, status);

  errorLogger.error('request failed', {
    status,
    code: normalized.code,
    ...(errorLike.details !== undefined ? { details: errorLike.details } : {}),
    errorMessage: errorLike.message,
    ...(EXPOSE_DETAILS && errorLike.stack ? { stack: errorLike.stack } : {}),
  });

  res.status(status).json(errorEnvelope(normalized));
}
