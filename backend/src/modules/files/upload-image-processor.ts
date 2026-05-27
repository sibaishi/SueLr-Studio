import fs from 'node:fs';
import sharp from 'sharp';
import { createLogger } from '../../platform/logging/logger.js';
import { ensureUploadThumbnail } from '../../platform/media/image-thumbnails.js';
import type { UploadRecord } from './types.js';
import { uploadMetadataRepository } from './upload-metadata.repository.js';

const logger = createLogger({ module: 'upload-image-processor' });
const activeJobs = new Map<string, Promise<void>>();

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

async function processImage(filename: string, filePath: string, mimeType: string) {
  const startedAt = Date.now();
  uploadMetadataRepository.patch(filename, {
    processingStatus: 'processing',
    processingError: '',
    processingStartedAt: startedAt,
    updatedAt: startedAt,
  });

  try {
    if (!fs.existsSync(filePath)) throw new Error('source file missing');

    const [dimensions, thumbnailUrl] = await Promise.all([
      readImageDimensions(filePath),
      ensureUploadThumbnail({
        filename,
        sourcePath: filePath,
        mimeType,
      }).catch(() => ''),
    ]);

    const finishedAt = Date.now();
    uploadMetadataRepository.patch(filename, {
      thumbnailUrl: thumbnailUrl || '',
      width: dimensions?.width,
      height: dimensions?.height,
      processingStatus: 'completed',
      processingError: '',
      processedAt: finishedAt,
      updatedAt: finishedAt,
    });
    logger.info('upload image post-processing completed', { filename, durationMs: finishedAt - startedAt });
  } catch (error) {
    const finishedAt = Date.now();
    uploadMetadataRepository.patch(filename, {
      processingStatus: 'failed',
      processingError: error instanceof Error ? error.message : String(error),
      failedAt: finishedAt,
      updatedAt: finishedAt,
    });
    logger.warn('upload image post-processing failed', {
      filename,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    activeJobs.delete(filename);
  }
}

export function enqueueUploadImageProcessing({ filename, filePath, mimeType }: UploadRecord) {
  const resolvedFilename = String(filename || '');
  if (!resolvedFilename || activeJobs.has(resolvedFilename)) return activeJobs.get(resolvedFilename) || null;
  const job = Promise.resolve().then(() =>
    processImage(resolvedFilename, String(filePath || ''), String(mimeType || '')),
  );
  activeJobs.set(resolvedFilename, job);
  return job;
}

export function resumePendingUploadImageProcessing() {
  for (const item of uploadMetadataRepository.listPendingImageRecords()) {
    enqueueUploadImageProcessing({
      filename: item.filename,
      filePath: item.filePath,
      mimeType: item.mimeType,
    });
  }
}
