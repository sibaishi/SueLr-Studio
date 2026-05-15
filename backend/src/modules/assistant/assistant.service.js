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
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
};

const IMAGE_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const VIDEO_MIME_EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

const logger = createLogger({ module: 'assistant-service' });

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildAssistantLocalUrl(directoryName, filename) {
  return `/api/assistant/files/${directoryName}/${filename}`;
}

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

  materializeAssistantAsset({ id, url, data, kind }) {
    const isImage = kind === 'image';
    const directoryName = isImage ? 'assistant-images' : 'assistant-videos';
    const mimeExtMap = isImage ? IMAGE_MIME_EXT : VIDEO_MIME_EXT;
    const writeFile = isImage
      ? this.repository.writeAssistantImage.bind(this.repository)
      : this.repository.writeAssistantVideo.bind(this.repository);

    if (data) {
      const parsed = parseDataUrl(data);
      if (parsed) {
        const ext = mimeExtMap[parsed.mimeType] || (isImage ? 'png' : 'mp4');
        const filename = `${id}.${ext}`;
        writeFile(filename, parsed.buffer);
        return buildAssistantLocalUrl(directoryName, filename);
      }
    }

    const normalizedUrl = String(url || '').trim();
    if (/^https?:\/\//i.test(normalizedUrl)) {
      return normalizedUrl;
    }

    if (normalizedUrl.startsWith('/api/assistant/files/')) {
      return normalizedUrl;
    }

    return normalizedUrl || '';
  }

  saveImage(body) {
    const gallery = this.repository.load('gallery');
    const localUrl = this.materializeAssistantAsset({
      id: body.id,
      url: body.url || body.localUrl,
      data: body.data,
      kind: 'image',
    });

    const record = {
      ...body,
      url: body.url || '',
      localUrl: localUrl || body.url || body.localUrl || null,
      storedAt: Date.now(),
    };
    delete record.data;

    gallery.push(record);
    this.repository.save('gallery', gallery);
    logger.info('assistant image stored', { imageId: body.id, localUrl: record.localUrl });
    return { localUrl: record.localUrl };
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
    const localUrl = this.materializeAssistantAsset({
      id: video.id,
      url: video.url || video.localUrl,
      data: video.data,
      kind: 'video',
    });

    const record = {
      ...video,
      url: video.url || '',
      localUrl: localUrl || video.url || video.localUrl || null,
      storedAt: Date.now(),
    };
    delete record.data;

    videos.push(record);
    this.repository.save('videos', videos);
    logger.info('assistant video stored', { videoId: video.id, localUrl: record.localUrl });
    return { localUrl: record.localUrl };
  }

  clearVideos() {
    this.repository.save('videos', []);
  }

  deleteVideo(id) {
    const videos = this.repository.load('videos');
    const item = videos.find((video) => video.id === id);
    if (item?.localUrl?.startsWith('/api/assistant/files/')) {
      const rel = item.localUrl.replace('/api/assistant/files/', '');
      this.repository.deleteGeneratedFile(rel);
    }
    this.repository.save('videos', videos.filter((video) => video.id !== id));
    logger.info('assistant video deleted', { videoId: id });
  }

  openGeneratedFile(relativePath) {
    const filePath = this.repository.resolveGeneratedFile(relativePath);
    if (!filePath) throw new ValidationError('FILE_ACCESS_DENIED', '非法文件路径');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundError('FILE_NOT_FOUND', '文件不存在');
    }

    return {
      filePath,
      contentType: MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    };
  }
}

export const assistantService = new AssistantService();
