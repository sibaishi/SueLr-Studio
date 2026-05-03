import {
  ValidationError,
} from '../../app/errors/index.js';

function ensureObject(payload, message) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return payload;
}

function cleanOptionalString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateRequiredString(value, fieldName, maxLength = 5000) {
  const normalized = cleanOptionalString(value, maxLength);
  if (!normalized) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不能为空`);
  }
  return normalized;
}

function validateArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为数组`);
  }
  return value;
}

function validateNumber(value, fallback, min = undefined, max = undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (min !== undefined && parsed < min) return fallback;
  if (max !== undefined && parsed > max) return fallback;
  return parsed;
}

function validateBoundedNumber(value, fieldName, { min, max, integer = false } = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为数字`);
  }
  if (integer && !Number.isInteger(parsed)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为整数`);
  }
  if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须在 ${min} 到 ${max} 之间`);
  }
  return parsed;
}

function validateEnum(value, fieldName, allowedValues) {
  const normalized = cleanOptionalString(value, 80);
  if (!normalized) return undefined;
  if (!allowedValues.includes(normalized)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不在允许范围内`);
  }
  return normalized;
}

function validateUrlOrEmpty(value, fieldName, allowedDataTypes = []) {
  const normalized = cleanOptionalString(value, 2000);
  if (!normalized) return '';
  const isHttp = /^https?:\/\//i.test(normalized);
  const isApiPath = normalized.startsWith('/api/');
  const dataMatch = normalized.match(/^data:([^;]+);base64,[a-zA-Z0-9+/=\s]+$/);
  const isAllowedDataUrl = Boolean(dataMatch && allowedDataTypes.some((prefix) => dataMatch[1].toLowerCase().startsWith(prefix)));
  if (!isHttp && !isApiPath && !isAllowedDataUrl) {
    const label = allowedDataTypes.includes('image/') ? '图片链接格式'
      : allowedDataTypes.includes('video/') ? '视频链接格式'
        : allowedDataTypes.includes('audio/') ? '音频链接格式'
          : '链接格式';
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的${label}`);
  }
  return normalized;
}

function validateUrlArray(value, fieldName, allowedDataTypes) {
  if (value === undefined) return undefined;
  return validateArray(value, fieldName).map((item, index) => validateUrlOrEmpty(item, `${fieldName}[${index}]`, allowedDataTypes)).filter(Boolean);
}

function normalizeApiConfig(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validateSearchQuery(value) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => cleanOptionalString(item, 1000)).filter(Boolean);
    if (!normalized.length) {
      throw new ValidationError('VALIDATION_ERROR', 'query 不能为空');
    }
    return normalized;
  }
  return validateRequiredString(value, 'query', 4000);
}

export function validateChatBody(payload) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: validateRequiredString(body.model, 'model', 200),
    messages: body.messages === undefined ? [] : validateArray(body.messages, 'messages'),
    tools: body.tools === undefined ? undefined : validateArray(body.tools, 'tools'),
  };
}

export function validateSearchBody(payload) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    query: validateSearchQuery(body.query),
    maxResults: validateNumber(body.maxResults, 5, 1, 20),
    includeAnswer: body.includeAnswer !== false,
  };
}

export function validateImageBody(payload) {
  const body = ensureObject(payload, '请求体必须为对象');
  return {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: validateRequiredString(body.model, 'model', 200),
    prompt: validateRequiredString(body.prompt, 'prompt', 12000),
    imageMode: validateEnum(body.imageMode, 'imageMode', ['standalone', 'chat']),
    ratio: validateEnum(body.ratio, 'ratio', ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']),
    width: validateBoundedNumber(body.width, 'width', { min: 16, max: 4096, integer: true }),
    height: validateBoundedNumber(body.height, 'height', { min: 16, max: 4096, integer: true }),
    quality: validateEnum(body.quality, 'quality', ['low', 'medium', 'high', 'auto']),
    n: validateBoundedNumber(body.n, 'n', { min: 1, max: 10, integer: true }),
    output_format: validateEnum(body.output_format || body.outputFormat, 'output_format', ['png', 'jpeg', 'webp']),
    image: validateUrlArray(body.image, 'image', ['image/']),
    mask: validateUrlOrEmpty(body.mask, 'mask', ['image/']),
  };
}

export function validateVideoBody(payload) {
  const body = ensureObject(payload, '请求体必须为对象');
  const normalized = {
    apiConfig: normalizeApiConfig(body.apiConfig),
    model: validateRequiredString(body.model, 'model', 200),
    prompt: cleanOptionalString(body.prompt, 12000),
    duration: validateBoundedNumber(body.duration, 'duration', { min: 1, max: 60 }),
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
    normalized.prompt
      || normalized.image_url
      || normalized.image_urls?.length
      || normalized.video_url
      || normalized.video_urls?.length
      || normalized.input_audio
      || normalized.input_audios?.length
      || normalized.messages?.length,
  );
  if (!hasInput) {
    throw new ValidationError('VALIDATION_ERROR', '视频生成输入不能为空');
  }
  return normalized;
}

export function validateTaskId(value) {
  const taskId = cleanOptionalString(value, 200);
  if (!taskId) throw new ValidationError('VALIDATION_ERROR', 'taskId 不能为空');
  return taskId;
}
