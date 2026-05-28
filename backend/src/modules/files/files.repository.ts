import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import {
  deleteGeneratedThumbnail,
  ensureGeneratedThumbnailFromFile,
  getGeneratedThumbnailPath,
} from '../../platform/media/image-thumbnails.ts';
import { ensureResourceOwnership } from '../../platform/runtime/index.ts';
import {
  STORAGE_PATHS,
  ensureScopedStorageDirectories,
  ensureStorageDirectories,
  getScopedStoragePaths,
  isResourceVisibleForScope,
  safeResolveWithin,
} from '../../platform/storage/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import type { ScopeOptions } from './types.ts';

const OUTPUT_FILE_TYPES = new Map([
  ['.png', { type: 'image', mimeType: 'image/png' }],
  ['.jpg', { type: 'image', mimeType: 'image/jpeg' }],
  ['.jpeg', { type: 'image', mimeType: 'image/jpeg' }],
  ['.webp', { type: 'image', mimeType: 'image/webp' }],
  ['.gif', { type: 'image', mimeType: 'image/gif' }],
  ['.svg', { type: 'image', mimeType: 'image/svg+xml' }],
  ['.mp4', { type: 'video', mimeType: 'video/mp4' }],
  ['.webm', { type: 'video', mimeType: 'video/webm' }],
  ['.mov', { type: 'video', mimeType: 'video/quicktime' }],
  ['.m4v', { type: 'video', mimeType: 'video/mp4' }],
  ['.mp3', { type: 'audio', mimeType: 'audio/mpeg' }],
  ['.wav', { type: 'audio', mimeType: 'audio/wav' }],
  ['.ogg', { type: 'audio', mimeType: 'audio/ogg' }],
  ['.m4a', { type: 'audio', mimeType: 'audio/mp4' }],
  ['.json', { type: 'data', mimeType: 'application/json' }],
  ['.txt', { type: 'text', mimeType: 'text/plain' }],
]);

function toOutputUrl(relativePath: string) {
  return `/api/outputs/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function decodeMojibakeText(value: DynamicValue) {
  const text = String(value || '');
  if (!text) return '';
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (!decoded || decoded === text) return text;
    if (decoded.includes('\uFFFD')) return text;
    return decoded;
  } catch {
    return text;
  }
}

export class FilesRepository {
  constructor() {
    ensureStorageDirectories();
  }

  getUploadsDir(options: ScopeOptions = {}) {
    ensureStorageDirectories();
    return ensureScopedStorageDirectories(options.scope).uploadsDir;
  }

  createUploadName(originalName: string) {
    const extension = path.extname(originalName).toLowerCase() || '.bin';
    return `${uuidv4()}${extension}`;
  }

  decodeOriginalName(name: DynamicValue) {
    return decodeMojibakeText(name);
  }

  resolveUploadFile(filename: DynamicValue, options: ScopeOptions = {}) {
    const filePath = safeResolveWithin(getScopedStoragePaths(options.scope).uploadsDir, filename);
    if (!filePath) throw new ValidationError('FILE_ACCESS_DENIED', '非法路径');
    return filePath;
  }

  deleteUpload(filename: DynamicValue, options: ScopeOptions = {}) {
    const filePath = this.resolveUploadFile(filename, options);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('FILE_NOT_FOUND', '文件不存在');
    }
    fs.unlinkSync(filePath);
  }

  deleteUploadedFilePath(filePath: DynamicValue) {
    if (!filePath) return;
    const resolved = safeResolveWithin(STORAGE_PATHS.uploadsDir, path.basename(filePath));
    if (!resolved || resolved !== filePath || !fs.existsSync(resolved)) return;
    fs.unlinkSync(resolved);
  }

  uploadExists(filename: DynamicValue, options: ScopeOptions = {}) {
    return fs.existsSync(this.resolveUploadFile(filename, options));
  }

  uploadedFileExists(filePath: DynamicValue) {
    return Boolean(filePath && fs.existsSync(filePath));
  }

  async listGeneratedOutputs(options: ScopeOptions = {}) {
    ensureStorageDirectories();
    const root = getScopedStoragePaths(options.scope).generatedDir;
    const items: PlainObject[] = [];

    const visit = async (dir: string): Promise<void> => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '.thumbnails') continue;
          await visit(filePath);
          continue;
        }
        if (!entry.isFile()) continue;

        const stat = fs.statSync(filePath);

        const relativePath = path.relative(root, filePath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

        const extension = path.extname(entry.name).toLowerCase();
        const fileType = OUTPUT_FILE_TYPES.get(extension) || { type: 'file', mimeType: 'application/octet-stream' };
        const thumbnailTarget =
          fileType.type === 'image'
            ? getGeneratedThumbnailPath(relativePath.split(path.sep).join('/'), { scope: options.scope })
            : null;
        const thumbnailUrl =
          thumbnailTarget?.absolutePath && fs.existsSync(thumbnailTarget.absolutePath)
            ? toOutputUrl(thumbnailTarget.relativePath)
            : '';
        const dimensions = fileType.type === 'image' ? await readImageDimensions(filePath) : null;
        const output = {
          id: relativePath.split(path.sep).join('/'),
          name: entry.name,
          relativePath: relativePath.split(path.sep).join('/'),
          url: toOutputUrl(relativePath),
          thumbnailUrl,
          type: fileType.type,
          mimeType: fileType.mimeType,
          width: dimensions?.width,
          height: dimensions?.height,
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        };
        const scopedOutput = ensureResourceOwnership(output as DynamicValue, options.scope) as PlainObject;
        if (!isResourceVisibleForScope(scopedOutput, options.scope)) continue;
        items.push(scopedOutput);
        if (fileType.type === 'image' && !output.thumbnailUrl) {
          void ensureGeneratedThumbnailFromFile({
            relativePath: relativePath.split(path.sep).join('/'),
            absolutePath: filePath,
            mimeType: fileType.mimeType,
            scope: options.scope,
          }).catch(() => {});
        }
      }
    };

    await visit(root);
    return items.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  clearGeneratedOutputs(options: ScopeOptions = {}) {
    ensureStorageDirectories();
    const root = getScopedStoragePaths(options.scope).generatedDir;
    let removed = 0;

    const visit = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '.thumbnails') {
            fs.rmSync(filePath, { recursive: true, force: true });
            continue;
          }
          visit(filePath);
          if (fs.existsSync(filePath) && fs.readdirSync(filePath).length === 0) {
            fs.rmdirSync(filePath);
          }
          continue;
        }
        if (!entry.isFile()) continue;

        const relativePath = path.relative(root, filePath).split(path.sep).join('/');
        fs.unlinkSync(filePath);
        deleteGeneratedThumbnail(relativePath, { scope: options.scope });
        removed += 1;
      }
    };

    visit(root);
    return { removed };
  }
}

export const filesRepository = new FilesRepository();

async function readImageDimensions(filePath: string) {
  try {
    const metadata = await sharp(filePath, { failOn: 'none' }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}
