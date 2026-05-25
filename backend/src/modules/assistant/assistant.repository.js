import fs from 'fs';
import path from 'path';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../platform/storage/index.js';
import { ensureGeneratedThumbnailFromBuffer, deleteGeneratedThumbnail } from '../../platform/media/image-thumbnails.js';

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

  writeAssistantFile(directoryName, filename, content) {
    const dir = path.join(STORAGE_PATHS.generatedDir, directoryName);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  writeAssistantImage(filename, content) {
    const filePath = this.writeAssistantFile('assistant-images', filename, content);
    void ensureGeneratedThumbnailFromBuffer({
      relativePath: `assistant-images/${filename}`,
      buffer: content,
      mimeType: `image/${path.extname(filename).toLowerCase().replace('.', '') || 'png'}`,
    }).catch(() => {});
    return filePath;
  }

  writeAssistantVideo(filename, content) {
    return this.writeAssistantFile('assistant-videos', filename, content);
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
