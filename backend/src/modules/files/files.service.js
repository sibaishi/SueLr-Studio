import multer from 'multer';
import { createLogger } from '../../platform/logging/logger.js';
import { filesRepository } from './files.repository.js';
import { deleteUploadThumbnail } from '../../platform/media/image-thumbnails.js';
import { uploadMetadataRepository } from './upload-metadata.repository.js';
import { enqueueUploadImageProcessing, resumePendingUploadImageProcessing } from './upload-image-processor.js';

const logger = createLogger({ module: 'files-service' });

export class FilesService {
  constructor(repository = filesRepository) {
    this.repository = repository;
    this.hasResumedPendingUploads = false;
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
    const isImage = String(file.mimetype || '').startsWith('image/');
    const now = Date.now();
    const record = {
      filename: file.filename,
      filePath: file.path,
      url: `/api/files/${file.filename}`,
      fileName: this.repository.decodeOriginalName(file.originalname),
      fileSize: file.size,
      mimeType: file.mimetype,
      kind: isImage ? 'image' : 'file',
      thumbnailUrl: '',
      width: undefined,
      height: undefined,
      processingStatus: isImage ? 'processing' : 'completed',
      processingError: '',
      createdAt: now,
      updatedAt: now,
    };

    uploadMetadataRepository.set(file.filename, record);
    if (isImage) {
      enqueueUploadImageProcessing({
        filename: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
      });
    }

    logger.info('file uploaded', { filename: file.filename, size: file.size, mimeType: file.mimetype });
    return {
      url: record.url,
      thumbnailUrl: '',
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType,
      width: undefined,
      height: undefined,
      processing: isImage,
      processingStatus: record.processingStatus,
    };
  }

  getUploadMetadata(filename) {
    this.resumePendingUploadProcessingIfNeeded();
    const record = uploadMetadataRepository.get(filename);
    if (!record) return null;

    const fileExists = record.filePath ? this.repository.uploadedFileExists(record.filePath) : this.repository.uploadExists(filename);
    if (!fileExists) {
      uploadMetadataRepository.delete(filename);
      return null;
    }

    return {
      url: record.url || `/api/files/${filename}`,
      thumbnailUrl: record.thumbnailUrl || '',
      fileName: record.fileName || filename,
      fileSize: record.fileSize || 0,
      mimeType: record.mimeType || '',
      width: record.width,
      height: record.height,
      processing: record.kind === 'image' && record.processingStatus !== 'completed',
      processingStatus: record.processingStatus || 'completed',
      processingError: record.processingError || '',
    };
  }

  deleteUpload(filename) {
    this.repository.deleteUpload(filename);
    deleteUploadThumbnail(filename);
    uploadMetadataRepository.delete(filename);
    logger.info('file deleted', { filename });
  }

  async listGeneratedOutputs() {
    return await this.repository.listGeneratedOutputs();
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
      if (file.filename) uploadMetadataRepository.delete(file.filename);
      logger.info('invalid upload cleaned', { filename: file.filename });
    } catch (error) {
      logger.warn('invalid upload cleanup failed', { filename: file.filename, error: error?.message });
    }
  }

  resumePendingUploadProcessingIfNeeded() {
    if (this.hasResumedPendingUploads) return;
    this.hasResumedPendingUploads = true;
    resumePendingUploadImageProcessing();
  }
}

export const filesService = new FilesService();
