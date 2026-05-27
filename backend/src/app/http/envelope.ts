export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? (error as ErrorLike) : {};
}

export function successEnvelope<T>(data: T): SuccessEnvelope<T> {
  return {
    success: true,
    data,
  };
}

export function errorEnvelope(error: unknown): ErrorEnvelope {
  const normalized = asErrorLike(error);
  return {
    success: false,
    error: {
      code: (typeof normalized.code === 'string' && normalized.code) || 'INTERNAL_ERROR',
      message: (typeof normalized.message === 'string' && normalized.message) || '请求处理失败',
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
    },
  };
}
