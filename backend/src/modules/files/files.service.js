import multer from 'multer';
import { createLogger } from '../../platform/logging/logger.js';
import { filesRepository } from './files.repository.js';
import { ensureUploadThumbnail, deleteUploadThumbnail } from '../../platform/media/image-thumbnails.js';

const logger = createLogger({ module: 'files-service' });

export class FilesService {
  constructor(repository = filesRepository) {
    this.repository = repository;
  }

  createUploader() {
    const repository = this.repository;
    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, repository.getUploadsDir());
      },
      filename: (_req, file, cb) => {
        cb(null, repository.createUploadName(file.originalname));
      },
    });

    return multer({
      storage,
      limits: { fileSize: 100 * 1024 * 1024 },
    });
  }

  async buildUploadResponse(file) {
    const thumbnailUrl = await ensureUploadThumbnail({
      filename: file.filename,
      sourcePath: file.path,
      mimeType: file.mimetype,
    }).catch(() => '');

    logger.info('file uploaded', { filename: file.filename, size: file.size, mimeType: file.mimetype });
    return {
      url: `/api/files/${file.filename}`,
      thumbnailUrl,
      fileName: this.repository.decodeOriginalName(file.originalname),
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  deleteUpload(filename) {
    this.repository.deleteUpload(filename);
    deleteUploadThumbnail(filename);
    logger.info('file deleted', { filename });
  }

  listGeneratedOutputs() {
    return this.repository.listGeneratedOutputs();
  }

  clearGeneratedOutputs() {
    const result = this.repository.clearGeneratedOutputs();
    logger.info('generated outputs cleared', result);
    return result;
  }

  cleanupUploadedFile(file) {
    if (!file?.path) return;
    try {
      this.repository.deleteUploadedFilePath(file.path);
      if (file.filename) deleteUploadThumbnail(file.filename);
      logger.info('invalid upload cleaned', { filename: file.filename });
    } catch (error) {
      logger.warn('invalid upload cleanup failed', { filename: file.filename, error: error?.message });
    }
  }
}

export const filesService = new FilesService();
