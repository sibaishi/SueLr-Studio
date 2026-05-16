import { ValidationError } from '../../app/errors/index.js';

function ensureObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return value;
}

function validateId(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不能为空`);
  if (normalized.length > 120) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 长度超限`);
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 包含非法字符`);
  return normalized;
}

function cleanOptionalString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateUrlOrEmpty(value, fieldName) {
  const normalized = cleanOptionalString(value, 4000);
  if (!normalized) return '';
  const isHttp = /^https?:\/\//i.test(normalized);
  const isApiPath = normalized.startsWith('/api/');
  const isDataUrl = normalized.startsWith('data:');
  if (!isHttp && !isApiPath && !isDataUrl) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的链接格式`);
  }
  return normalized;
}

function validateUrlArray(value, fieldName) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 必须为数组`);
  }
  return value
    .map((item, index) => validateUrlOrEmpty(item, `${fieldName}[${index}]`))
    .filter(Boolean);
}

function validateDataUrlImage(value, fieldName) {
  const normalized = cleanOptionalString(value, 10 * 1024 * 1024);
  if (!normalized) return '';
  if (!/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/.test(normalized)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的图片 data URL`);
  }
  return normalized;
}

function validateDataUrlVideo(value, fieldName) {
  const normalized = cleanOptionalString(value, 300 * 1024 * 1024);
  if (!normalized) return '';
  if (!/^data:video\/([a-zA-Z0-9.+-]+);base64,[a-zA-Z0-9+/=\s]+$/.test(normalized)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的视频 data URL`);
  }
  return normalized;
}

function normalizeConversationMessages(record) {
  const messages = record.msgs ?? record.messages;
  if (messages === undefined) return [];
  if (!Array.isArray(messages)) {
    throw new ValidationError('VALIDATION_ERROR', 'conversation.msgs 必须为数组');
  }
  return messages;
}

function normalizeConversationTimestamp(record) {
  const ts = Number(record.ts ?? record.updatedAt);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function normalizeRelativePath(value, fieldName) {
  const normalized = cleanOptionalString(value, 400).replace(/\\/g, '/');
  if (!normalized) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不能为空`);
  }
  if (normalized.startsWith('/') || normalized.includes('//')) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的文件路径`);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不是允许的文件路径`);
  }

  if (segments.some((segment) => !/^[a-zA-Z0-9._-]+$/.test(segment))) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} 包含非法字符`);
  }
  return segments.join('/');
}

export function validateConversationList(payload) {
  const list = Array.isArray(payload) ? payload : ensureObject(payload, '请求体必须为对象').convs;
  if (!Array.isArray(list)) throw new ValidationError('VALIDATION_ERROR', 'convs 必须为数组');
  return list.map((item) => {
    const record = ensureObject(item, '会话项必须为对象');
    return {
      id: validateId(record.id, 'conversation.id'),
      title: cleanOptionalString(record.title, 200),
      model: cleanOptionalString(record.model, 200),
      msgs: normalizeConversationMessages(record),
      ts: normalizeConversationTimestamp(record),
    };
  });
}

export function validateGalleryItem(payload) {
  const record = ensureObject(payload, '图片记录必须为对象');
  return {
    ...record,
    id: validateId(record.id, 'image.id'),
    prompt: cleanOptionalString(record.prompt, 8000),
    model: cleanOptionalString(record.model, 200),
    ts: Number(record.ts) || Date.now(),
    url: validateUrlOrEmpty(record.url, 'image.url'),
    localUrl: validateUrlOrEmpty(record.localUrl, 'image.localUrl'),
    data: validateDataUrlImage(record.data, 'image.data'),
  };
}

export function validateVideoItem(payload) {
  const record = ensureObject(payload, '视频记录必须为对象');
  return {
    ...record,
    id: validateId(record.id, 'video.id'),
    url: validateUrlOrEmpty(record.url, 'video.url'),
    localUrl: validateUrlOrEmpty(record.localUrl, 'video.localUrl'),
    candidateUrls: validateUrlArray(record.candidateUrls, 'video.candidateUrls'),
    data: validateDataUrlVideo(record.data, 'video.data'),
    prompt: cleanOptionalString(record.prompt, 8000),
    model: cleanOptionalString(record.model, 200),
    ts: Number(record.ts) || Date.now(),
  };
}

export function validateAssistantFilePath(value) {
  return normalizeRelativePath(value, 'filePath');
}

export function validateAssistantRecordId(value, fieldName) {
  return validateId(value, fieldName);
}
