import { ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue } from '../types.ts';
import type { UploadedFileLike } from './types.ts';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mp3',
  '.m4a',
  '.ogg',
  '.wav',
]);

const MISSING_UPLOAD_BASENAME_MESSAGE = '文件无文件名，请重命名后重新上传';

export function validateUploadFile(file: Partial<UploadedFileLike> | undefined | null) {
  if (!file) throw new ValidationError('UPLOAD_FILE_REQUIRED', '未选择文件');
  const originalName = String(file.originalname || '').trim();
  if (!originalName || !originalName.replace(/\.[^.]+$/, '')) {
    throw new ValidationError('UPLOAD_FAILED', MISSING_UPLOAD_BASENAME_MESSAGE);
  }
  const extension = originalName.toLowerCase().match(/\.[^.]+$/)?.[0] || '.bin';
  if (!ALLOWED_MIME_TYPES.has(String(file.mimetype || '')) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationError('UPLOAD_FAILED', '不支持的文件类型');
  }
  return file;
}

export function validateFilename(value: DynamicValue) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', 'filename 不能为空');
  if (normalized.length > 200) throw new ValidationError('VALIDATION_ERROR', 'filename 长度超限');
  if (normalized === '.' || normalized === '..')
    throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  if (/[\\/]/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'filename 包含非法字符');
  if (normalized.startsWith('.')) throw new ValidationError('VALIDATION_ERROR', 'filename 不是允许的文件名');
  return normalized;
}

export function validateUploadMetadataQuery(value: DynamicValue) {
  return validateFilename(value);
}
