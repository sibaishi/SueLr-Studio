import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError } from '../../app/errors/index.js';
import { STORAGE_PATHS, ensureStorageDirectories, safeResolveWithin } from '../../platform/storage/index.js';

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
    try {
      return Buffer.from(name, 'latin1').toString('utf8');
    } catch {
      return name;
    }
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
}

export const filesRepository = new FilesRepository();
