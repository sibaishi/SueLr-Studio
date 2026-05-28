import {
  AppError,
  ConflictError,
  NotFoundError,
  ProviderError,
  UnauthorizedError,
  ValidationError,
} from './app-error.ts';

export { AppError, ValidationError, NotFoundError, ConflictError, ProviderError, UnauthorizedError };

interface LegacyErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface LegacyErrorFallback {
  status?: number;
  code?: string;
  message?: string;
}

function asLegacyErrorLike(error: unknown): LegacyErrorLike {
  return error && typeof error === 'object' ? (error as LegacyErrorLike) : {};
}

export function fromLegacyError(error: unknown, fallback: LegacyErrorFallback = {}): AppError {
  if (error instanceof AppError) return error;

  const legacy = asLegacyErrorLike(error);
  const status = Number(legacy.status) || fallback.status || 500;
  const code = (typeof legacy.code === 'string' && legacy.code) || fallback.code || 'INTERNAL_ERROR';
  const message = (typeof legacy.message === 'string' && legacy.message) || fallback.message || '请求处理失败';
  const details = legacy.details;

  if (status === 400) return new ValidationError(code, message, details);
  if (status === 404) return new NotFoundError(code, message, details);
  if (status === 502) return new ProviderError(code, message, details, error);
  return new AppError(status, code, message, details, error);
}
