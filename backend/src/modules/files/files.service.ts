// @ts-expect-error Multer does not ship local type declarations in this backend package yet.
import multer from 'multer';
import { createLogger } from '../../platform/logging/logger.ts';
import { deleteUploadThumbnail } from '../../platform/media/image-thumbnails.ts';
import { ensureResourceOwnership } from '../../platform/runtime/index.ts';
import { isResourceVisibleForScope } from '../../platform/storage/index.ts';
import type { DynamicValue } from '../types.ts';
import { filesRepository } from './files.repository.ts';
import type { ScopeOptions, UploadedFileLike } from './types.ts';
import { enqueueUploadImageProcessing, resumePendingUploadImageProcessing } from './upload-image-processor.ts';
import { uploadMetadataRepository } from './upload-metadata.repository.ts';

const logger = createLogger({ module: 'files-service' });

export class FilesService {
  repository;
  hasResumedPendingUploads: boolean;

  constructor(repository = filesRepository) {
    this.repository = repository;
    this.hasResumedPendingUploads = false;
  }

  createUploader() {
    const repository = this.repository;
    const storage = multer.diskStorage({
      destination: (req: DynamicValue, _file: DynamicValue, cb: (error: Error | null, destination: string) => void) => {
        cb(null, repository.getUploadsDir({ scope: req.scope }));
      },
      filename: (_req: DynamicValue, file: UploadedFileLike, cb: (error: Error | null, filename: string) => void) => {
        cb(null, repository.createUploadName(file.originalname));
      },
    });

    return multer({
      storage,
      limits: { fileSize: 100 * 1024 * 1024 },
    });
  }

  async buildUploadResponse(file: UploadedFileLike, options: ScopeOptions = {}) {
    const isImage = String(file.mimetype || '').startsWith('image/');
    const now = Date.now();
    const record = ensureResourceOwnership(
      {
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
      },
      options.scope,
    );

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

  getUploadMetadata(filename: DynamicValue, _options: ScopeOptions = {}) {
    this.resumePendingUploadProcessingIfNeeded();
    const record = uploadMetadataRepository.get(filename);
    if (!record) return null;

    const visible = isResourceVisibleForScope(record as DynamicValue, _options.scope);
    const fileExists =
      visible &&
      (record.filePath
        ? this.repository.uploadedFileExists(record.filePath)
        : this.repository.uploadExists(filename, _options));
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

  deleteUpload(filename: DynamicValue, _options: ScopeOptions = {}) {
    this.repository.deleteUpload(filename, _options);
    deleteUploadThumbnail(filename);
    uploadMetadataRepository.delete(filename);
    logger.info('file deleted', { filename });
  }

  async listGeneratedOutputs(_options: ScopeOptions = {}) {
    return await this.repository.listGeneratedOutputs(_options);
  }

  clearGeneratedOutputs(_options: ScopeOptions = {}) {
    const result = this.repository.clearGeneratedOutputs(_options);
    logger.info('generated outputs cleared', result);
    return result;
  }

  cleanupUploadedFile(file: Partial<UploadedFileLike> | undefined | null) {
    if (!file?.path) return;
    try {
      this.repository.deleteUploadedFilePath(file.path);
      if (file.filename) deleteUploadThumbnail(file.filename);
      if (file.filename) uploadMetadataRepository.delete(file.filename);
      logger.info('invalid upload cleaned', { filename: file.filename });
    } catch (error: unknown) {
      logger.warn('invalid upload cleanup failed', {
        filename: file.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  resumePendingUploadProcessingIfNeeded() {
    if (this.hasResumedPendingUploads) return;
    this.hasResumedPendingUploads = true;
    resumePendingUploadImageProcessing();
  }
}

export const filesService = new FilesService();
