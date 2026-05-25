import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError } from '../../app/errors/index.js';
import { STORAGE_PATHS, ensureStorageDirectories, safeResolveWithin } from '../../platform/storage/index.js';

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

function toOutputUrl(relativePath) {
  return `/api/outputs/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function decodeMojibakeText(value) {
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

  getUploadsDir() {
    ensureStorageDirectories();
    return STORAGE_PATHS.uploadsDir;
  }

  createUploadName(originalName) {
    const extension = path.extname(originalName).toLowerCase() || '.bin';
    return `${uuidv4()}${extension}`;
  }

  decodeOriginalName(name) {
    return decodeMojibakeText(name);
  }

  resolveUploadFile(filename) {
    const filePath = safeResolveWithin(STORAGE_PATHS.uploadsDir, filename);
    if (!filePath) throw new ValidationError('FILE_ACCESS_DENIED', '非法路径');
    return filePath;
  }

  deleteUpload(filename) {
    const filePath = this.resolveUploadFile(filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('FILE_NOT_FOUND', '文件不存在');
    }
    fs.unlinkSync(filePath);
  }

  deleteUploadedFilePath(filePath) {
    if (!filePath) return;
    const resolved = safeResolveWithin(STORAGE_PATHS.uploadsDir, path.basename(filePath));
    if (!resolved || resolved !== filePath || !fs.existsSync(resolved)) return;
    fs.unlinkSync(resolved);
  }

  listGeneratedOutputs() {
    ensureStorageDirectories();
    const root = STORAGE_PATHS.generatedDir;
    const items = [];

    const visit = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(filePath);
          continue;
        }
        if (!entry.isFile()) continue;

        const stat = fs.statSync(filePath);

        const relativePath = path.relative(root, filePath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

        const extension = path.extname(entry.name).toLowerCase();
        const fileType = OUTPUT_FILE_TYPES.get(extension) || { type: 'file', mimeType: 'application/octet-stream' };
        items.push({
          id: relativePath.split(path.sep).join('/'),
          name: entry.name,
          relativePath: relativePath.split(path.sep).join('/'),
          url: toOutputUrl(relativePath),
          type: fileType.type,
          mimeType: fileType.mimeType,
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        });
      }
    };

    visit(root);
    return items.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  clearGeneratedOutputs() {
    ensureStorageDirectories();
    const root = STORAGE_PATHS.generatedDir;
    let removed = 0;

    const visit = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(filePath);
          if (fs.existsSync(filePath) && fs.readdirSync(filePath).length === 0) {
            fs.rmdirSync(filePath);
          }
          continue;
        }
        if (!entry.isFile()) continue;

        const stat = fs.statSync(filePath);
        fs.unlinkSync(filePath);
        removed += 1;
      }
    };

    visit(root);
    return { removed };
  }
}

export const filesRepository = new FilesRepository();
