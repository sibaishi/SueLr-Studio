export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createErrorBody(error) {
  return {
    success: false,
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message: error?.message || '请求处理失败',
      ...(error?.details !== undefined ? { details: error.details } : {}),
    },
  };
}

export function sendError(res, error) {
  const status = Number(error?.status) || 500;
  res.status(status).json(createErrorBody(error));
}

export function assert(condition, status, code, message, details = undefined) {
  if (!condition) {
    throw new HttpError(status, code, message, details);
  }
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asPlainObject(value, code, message) {
  assert(isPlainObject(value), 400, code, message);
  return value;
}

export function cleanString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

export function cleanOptionalString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  const normalized = cleanString(value);
  return normalized.slice(0, maxLength);
}

export function validateEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function validateBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function validateNumber(value, fallback, min = undefined, max = undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = parsed;
  if (min !== undefined && rounded < min) return fallback;
  if (max !== undefined && rounded > max) return fallback;
  return rounded;
}

export function validateId(value, fieldName = 'id') {
  const normalized = cleanString(value);
  assert(normalized.length > 0, 400, 'VALIDATION_ERROR', `${fieldName} 不能为空`);
  assert(normalized.length <= 120, 400, 'VALIDATION_ERROR', `${fieldName} 长度超限`);
  assert(/^[a-zA-Z0-9._-]+$/.test(normalized), 400, 'VALIDATION_ERROR', `${fieldName} 包含非法字符`);
  return normalized;
}

export function validateArray(value, fieldName) {
  assert(Array.isArray(value), 400, 'VALIDATION_ERROR', `${fieldName} 必须为数组`);
  return value;
}

export function validateUrlOrEmpty(value, fieldName) {
  const normalized = cleanOptionalString(value, 2000);
  if (!normalized) return '';
  const isHttp = /^https?:\/\//i.test(normalized);
  const isApiPath = normalized.startsWith('/api/');
  const isDataUrl = normalized.startsWith('data:');
  assert(isHttp || isApiPath || isDataUrl, 400, 'VALIDATION_ERROR', `${fieldName} 不是允许的链接格式`);
  return normalized;
}

export function validateDataUrlImage(value, fieldName) {
  const normalized = cleanOptionalString(value, 10 * 1024 * 1024);
  if (!normalized) return '';
  assert(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(normalized), 400, 'VALIDATION_ERROR', `${fieldName} 不是允许的图片 data URL`);
  return normalized;
}
