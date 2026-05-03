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

  writeAssistantImage(filename, content) {
    const dir = path.join(STORAGE_PATHS.generatedDir, 'assistant-images');
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  deleteGeneratedFile(relativePath) {
    const filePath = safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  resolveGeneratedFile(relativePath) {
    return safeResolveWithin(STORAGE_PATHS.generatedDir, relativePath);
  }
}

export const assistantRepository = new AssistantRepository();
