import fs from 'node:fs';
import path from 'node:path';
import { deleteGeneratedThumbnail, ensureGeneratedThumbnailFromBuffer } from '../../platform/media/image-thumbnails.ts';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../platform/storage/index.ts';
import type { DynamicValue } from '../types.ts';

type AssistantStoreType = 'conversations' | 'gallery' | 'videos';
type WriteOptions = { scope?: DynamicValue };

const DATA_FILE_MAP = {
  conversations: STORAGE_PATHS.conversationsFile,
  gallery: STORAGE_PATHS.galleryFile,
  videos: STORAGE_PATHS.videosFile,
};

export class AssistantRepository {
  constructor() {
    ensureStorageDirectories();
    ensureJsonFile(STORAGE_PATHS.conversationsFile, []);
    ensureJsonFile(STORAGE_PATHS.galleryFile, []);
    ensureJsonFile(STORAGE_PATHS.videosFile, []);
  }

  load(type: AssistantStoreType): DynamicValue[] {
    return readJsonFile(DATA_FILE_MAP[type], []);
  }

  save(type: AssistantStoreType, data: DynamicValue) {
    writeJsonFile(DATA_FILE_MAP[type], data);
  }

  writeAssistantFile(
    directoryName: string,
    filename: string,
    content: string | NodeJS.ArrayBufferView,
    _options: WriteOptions = {},
  ) {
    const dir = path.join(STORAGE_PATHS.generatedDir, directoryName);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  writeAssistantImage(filename: string, content: Buffer, options: WriteOptions = {}) {
    const filePath = this.writeAssistantFile('assistant-images', filename, content, options);
    void ensureGeneratedThumbnailFromBuffer({
      relativePath: `assistant-images/${filename}`,
      buffer: content,
      mimeType: `image/${path.extname(filename).toLowerCase().replace('.', '') || 'png'}`,
    }).catch(() => {});
    return filePath;
  }

  writeAssistantVideo(filename: string, content: string | NodeJS.ArrayBufferView, options: WriteOptions = {}) {
    return this.writeAssistantFile('assistant-videos', filename, content, options);
  }

  deleteGeneratedFile(relativePath: string) {
    const filePath = safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    deleteGeneratedThumbnail(relativePath);
  }

  resolveGeneratedFile(relativePath: string) {
    return safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
  }
}

export const assistantRepository = new AssistantRepository();
