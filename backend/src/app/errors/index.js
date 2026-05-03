import { AppError, ConflictError, NotFoundError, ProviderError, ValidationError } from './app-error.js';

export { AppError, ValidationError, NotFoundError, ConflictError, ProviderError };

export function fromLegacyError(error, fallback = {}) {
  if (error instanceof AppError) return error;

  const status = Number(error?.status) || fallback.status || 500;
  const code = error?.code || fallback.code || 'INTERNAL_ERROR';
  const message = error?.message || fallback.message || '请求处理失败';
  const details = error?.details;

  if (status === 400) return new ValidationError(code, message, details);
  if (status === 404) return new NotFoundError(code, message, details);
  if (status === 502) return new ProviderError(code, message, details, error);
  return new AppError(status, code, message, details, error);
}
