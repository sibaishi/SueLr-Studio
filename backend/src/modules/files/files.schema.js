import { ValidationError } from '../../app/errors/index.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov', '.mp3', '.wav']);

export function validateUploadFile(file) {
  if (!file) throw new ValidationError('UPLOAD_FILE_REQUIRED', '未选择文件');
  const extension = String(file.originalname || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '.bin';
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationError('UPLOAD_FAILED', '不支持的文件类型');
  }
  return file;
}

export function validateFilename(value) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', 'filename 不能为空');
  if (normalized.length > 200) throw new ValidationError('VALIDATION_ERROR', 'filename 长度超限');
  if (normalized === '.' || normalized === '..') throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  if (/[\\/]/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'filename 包含非法字符');
  if (normalized.startsWith('.')) throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  return normalized;
}
