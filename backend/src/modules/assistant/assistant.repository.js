import fs from 'node:fs';
import path from 'node:path';
import { deleteGeneratedThumbnail, ensureGeneratedThumbnailFromBuffer } from '../../platform/media/image-thumbnails.js';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../platform/storage/index.js';

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

  load(type) {
    return readJsonFile(DATA_FILE_MAP[type], []);
  }

  save(type, data) {
    writeJsonFile(DATA_FILE_MAP[type], data);
  }

  writeAssistantFile(directoryName, filename, content, _options = {}) {
    const dir = path.join(STORAGE_PATHS.generatedDir, directoryName);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  writeAssistantImage(filename, content, options = {}) {
    const filePath = this.writeAssistantFile('assistant-images', filename, content, options);
    void ensureGeneratedThumbnailFromBuffer({
      relativePath: `assistant-images/${filename}`,
      buffer: content,
      mimeType: `image/${path.extname(filename).toLowerCase().replace('.', '') || 'png'}`,
    }).catch(() => {});
    return filePath;
  }

  writeAssistantVideo(filename, content, options = {}) {
    return this.writeAssistantFile('assistant-videos', filename, content, options);
  }

  deleteGeneratedFile(relativePath) {
    const filePath = safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    deleteGeneratedThumbnail(relativePath);
  }

  resolveGeneratedFile(relativePath) {
    return safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
  }
}

export const assistantRepository = new AssistantRepository();
