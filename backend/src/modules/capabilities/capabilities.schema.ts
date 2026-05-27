import { ValidationError } from '../../app/errors/index.js';
import type { DynamicValue, PlainObject } from '../types.js';

type BoundedNumberOptions = {
  min?: number;
  max?: number;
  integer?: boolean;
};

type MediaDataPrefix = `${string}/`;

function ensureObject(payload: DynamicValue, message: string): PlainObject {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return payload as PlainObject;
}

function cleanOptionalString(value: DynamicValue, maxLength = 5000): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateRequiredString(value: DynamicValue, fieldName: string, maxLength = 5000): string {
  const normalized = cleanOptionalString(value, maxLength);
  if (!normalized) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不能为空`);
  }
  return normalized;
}

function validateArray(value: DynamicValue, fieldName: string): DynamicValue[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为数组`);
  }
  return value;
}

function validateNumber(
  value: DynamicValue,
  fallback: number,
  min: number | undefined = undefined,
  max: number | undefined = undefined,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (min !== undefined && parsed < min) return fallback;
  if (max !== undefined && parsed > max) return fallback;
  return parsed;
}

function formatRange(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${min} 到 ${max}`;
  if (min !== undefined) return `大于等于 ${min}`;
  if (max !== undefined) return `小于等于 ${max}`;
  return '允许范围内';
}

function validateBoundedNumber(
  value: DynamicValue,
  fieldName: string,
  { min, max, integer = false }: BoundedNumberOptions = {},
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为数字`);
  }
  if (integer && !Number.isInteger(parsed)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为整数`);
  }
  if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须在 ${formatRange(min, max)} 之间`);
  }
  return parsed;
}

function validateVideoDuration(value: DynamicValue): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = validateBoundedNumber(value, 'duration', { integer: true });
  if (parsed === undefined) return undefined;
  if (parsed === -1 || (parsed >= 4 && parsed <= 15)) return parsed;
  throw new ValidationError('VALIDATION_ERROR', 'duration 必须为 -1 或 4 到 15 的整数');
}

function validateEnum<TValue extends string>(
  value: DynamicValue,
  fieldName: string,
  allowedValues: readonly TValue[],
): TValue | undefined {
  const normalized = cleanOptionalString(value, 80);
  if (!normalized) return undefined;
  if (!allowedValues.includes(normalized as TValue)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不在允许范围内`);
  }
  return normalized as TValue;
}

function getUrlLabel(allowedDataTypes: readonly MediaDataPrefix[]): string {
  if (allowedDataTypes.includes('image/')) return '图片链接格式';
  if (allowedDataTypes.includes('video/')) return '视频链接格式';
  if (allowedDataTypes.includes('audio/')) return '音频链接格式';
  return '链接格式';
}

function validateUrlOrEmpty(
  value: DynamicValue,
  fieldName: string,
  allowedDataTypes: readonly MediaDataPrefix[] = [],
): string {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';

  const isHttp = /^https?:\/\//i.test(normalized);
  const isApiPath = normalized.startsWith('/api/');
  const dataMatch = normalized.match(/^data:([^;]+);base64,[a-zA-Z0-9+/=\s]+$/);
  const isAllowedDataUrl = Boolean(
    dataMatch && allowedDataTypes.some((prefix) => dataMatch[1]?.toLowerCase().startsWith(prefix)),
  );

  if (!isHttp && !isApiPath && !isAllowedDataUrl) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的${getUrlLabel(allowedDataTypes)}`);
  }
  if ((isHttp || isApiPath) && normalized.length > 2000) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 过长`);
  }
  return normalized;
}

function validateUrlArray(
  value: DynamicValue,
  fieldName: string,
  allowedDataTypes: readonly MediaDataPrefix[],
): string[] | undefined {
  if (value === undefined) return undefined;
  return validateArray(value, fieldName)
    .map((item, index) => validateUrlOrEmpty(item, `${fieldName}[${index}]`, allowedDataTypes))
    .filter(Boolean);
}

function normalizeApiConfig(value: DynamicValue): PlainObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validateSearchQuery(value: DynamicValue): string | string[] {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => cleanOptionalString(item, 1000)).filter(Boolean);
    if (!normalized.length) {
      throw new ValidationError('VALIDATION_ERROR', 'query 不能为空');
    }
    return normalized;
  }
  return validateRequiredString(value, 'query', 4000);
}

export function validateChatBody(payload: DynamicValue) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: validateRequiredString(body.model, 'model', 200),
    messages: body.messages === undefined ? [] : validateArray(body.messages, 'messages'),
    tools: body.tools === undefined ? undefined : validateArray(body.tools, 'tools'),
    stream: body.stream === true,
  };
}

export function validateSearchBody(payload: DynamicValue) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    query: validateSearchQuery(body.query),
    maxResults: validateNumber(body.maxResults, 5, 1, 20),
    includeAnswer: body.includeAnswer !== false,
  };
}

export function validateImageBody(payload: DynamicValue) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: cleanOptionalString(body.model, 200),
    prompt: validateRequiredString(body.prompt, 'prompt', 12000),
    imageMode: validateEnum(body.imageMode, 'imageMode', ['standalone', 'chat']),
    ratio: validateEnum(body.ratio, 'ratio', ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']),
    width: validateBoundedNumber(body.width, 'width', { min: 16, max: 4096, integer: true }),
    height: validateBoundedNumber(body.height, 'height', { min: 16, max: 4096, integer: true }),
    quality: validateEnum(body.quality, 'quality', ['low', 'medium', 'high', 'auto']),
    resolution: validateEnum(
      cleanOptionalString(body.resolution || body.outputResolution || body.output_resolution, 40).toLowerCase(),
      'resolution',
      ['auto', '512px', '1k', '2k', '4k'],
    ),
    n: validateBoundedNumber(body.n, 'n', { min: 1, max: 10, integer: true }),
    output_format: validateEnum(body.output_format || body.outputFormat, 'output_format', ['png', 'jpeg', 'webp']),
    image: validateUrlArray(body.image, 'image', ['image/']),
    mask: validateUrlOrEmpty(body.mask, 'mask', ['image/']),
  };
}

export function validateVideoBody(payload: DynamicValue) {
  const body = ensureObject(payload, '请求体必须为对象');
  const normalized = {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: validateRequiredString(body.model, 'model', 200),
    prompt: cleanOptionalString(body.prompt, 12000),
    duration: validateVideoDuration(body.duration),
    aspect_ratio: cleanOptionalString(body.aspect_ratio, 40),
    resolution: cleanOptionalString(body.resolution, 40),
    image_url: validateUrlOrEmpty(body.image_url, 'image_url', ['image/']),
    image_urls: validateUrlArray(body.image_urls, 'image_urls', ['image/']),
    video_url: validateUrlOrEmpty(body.video_url, 'video_url', ['video/']),
    video_urls: validateUrlArray(body.video_urls, 'video_urls', ['video/']),
    input_audio: validateUrlOrEmpty(body.input_audio, 'input_audio', ['audio/']),
    input_audios: validateUrlArray(body.input_audios, 'input_audios', ['audio/']),
    messages: body.messages === undefined ? undefined : validateArray(body.messages, 'messages'),
  };

  const hasInput = Boolean(
    normalized.prompt ||
      normalized.image_url ||
      normalized.image_urls?.length ||
      normalized.video_url ||
      normalized.video_urls?.length ||
      normalized.input_audio ||
      normalized.input_audios?.length ||
      normalized.messages?.length,
  );

  if (!hasInput) {
    throw new ValidationError('VALIDATION_ERROR', '视频生成输入不能为空');
  }

  return normalized;
}

export function validateTaskId(value: DynamicValue): string {
  const taskId = cleanOptionalString(value, 200);
  if (!taskId) throw new ValidationError('VALIDATION_ERROR', 'taskId 不能为空');
  return taskId;
}

export function validateVideoStatusBody(payload: DynamicValue) {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
  };
}
