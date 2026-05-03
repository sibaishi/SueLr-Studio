import { errorEnvelope } from '../http/envelope.js';
import { createLogger } from '../../platform/logging/logger.js';

const errorLogger = createLogger({ module: 'error-handler' });
const EXPOSE_DETAILS = process.env.APP_EXPOSE_ERROR_DETAILS === 'true';

function toSafeClientError(error, status) {
  const code = error?.code || 'INTERNAL_ERROR';

  if (status >= 500) {
    return {
      code,
      message: status === 502 ? '上游服务请求失败，请检查配置或稍后重试' : '服务器内部错误，请稍后重试',
    };
  }

  const normalized = {
    code,
    message: error?.message || '请求处理失败',
  };

  if (EXPOSE_DETAILS && error?.details !== undefined) {
    normalized.details = error.details;
  }

  return normalized;
}

export function errorHandler(error, _req, res, _next) {
  const status = Number(error?.status) || 500;
  const normalized = toSafeClientError(error, status);

  errorLogger.error('request failed', {
    status,
    code: normalized.code,
    ...(error?.details !== undefined ? { details: error.details } : {}),
    errorMessage: error?.message,
    ...(EXPOSE_DETAILS && error?.stack ? { stack: error.stack } : {}),
  });

  res.status(status).json(errorEnvelope(normalized));
}
