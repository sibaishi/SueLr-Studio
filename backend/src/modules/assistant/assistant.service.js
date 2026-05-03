import fs from 'fs';
import path from 'path';
import { NotFoundError, ValidationError } from '../../app/errors/index.js';
import { createLogger } from '../../platform/logging/logger.js';
import { assistantRepository } from './assistant.repository.js';

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

const logger = createLogger({ module: 'assistant-service' });

export class AssistantService {
  constructor(repository = assistantRepository) {
    this.repository = repository;
  }

  getStatus() {
    return { ok: true, version: '1.0.0' };
  }

  getConversations() {
    return this.repository.load('conversations');
  }

  saveConversations(conversations) {
    this.repository.save('conversations', conversations);
    logger.info('assistant conversations updated', { count: conversations.length });
  }

  deleteConversation(id) {
    const next = this.repository.load('conversations').filter((conversation) => conversation.id !== id);
    this.repository.save('conversations', next);
    logger.info('assistant conversation deleted', { conversationId: id });
  }

  getImages() {
    return this.repository.load('gallery');
  }

  saveImage(body) {
    const gallery = this.repository.load('gallery');
    if (body.data) {
      const match = body.data.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
      if (match) {
        const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
        const ext = extMap[match[1]] || 'png';
        const filename = `${body.id}.${ext}`;
        this.repository.writeAssistantImage(filename, Buffer.from(match[2], 'base64'));
        body.localUrl = `/api/assistant/files/assistant-images/${filename}`;
      }
      delete body.data;
    } else {
      body.localUrl = body.url || body.localUrl || null;
    }

    body.storedAt = Date.now();
    gallery.push(body);
    this.repository.save('gallery', gallery);
    logger.info('assistant image stored', { imageId: body.id });
    return { localUrl: body.localUrl };
  }

  clearImages() {
    this.repository.save('gallery', []);
  }

  deleteImage(id) {
    const gallery = this.repository.load('gallery');
    const item = gallery.find((entry) => entry.id === id);
    if (item?.localUrl?.startsWith('/api/assistant/files/')) {
      const rel = item.localUrl.replace('/api/assistant/files/', '');
      this.repository.deleteGeneratedFile(rel);
    }
    this.repository.save('gallery', gallery.filter((entry) => entry.id !== id));
    logger.info('assistant image deleted', { imageId: id });
  }

  getVideos() {
    return this.repository.load('videos');
  }

  saveVideo(video) {
    const videos = this.repository.load('videos');
    videos.push({ ...video, storedAt: Date.now() });
    this.repository.save('videos', videos);
    logger.info('assistant video stored', { videoId: video.id });
  }

  clearVideos() {
    this.repository.save('videos', []);
  }

  deleteVideo(id) {
    this.repository.save('videos', this.repository.load('videos').filter((video) => video.id !== id));
    logger.info('assistant video deleted', { videoId: id });
  }

  openGeneratedFile(relativePath) {
    const filePath = this.repository.resolveGeneratedFile(relativePath);
    if (!filePath) throw new ValidationError('FILE_ACCESS_DENIED', 'Forbidden');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundError('FILE_NOT_FOUND', 'Not found');
    }

    return {
      filePath,
      contentType: MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    };
  }
}

export const assistantService = new AssistantService();
