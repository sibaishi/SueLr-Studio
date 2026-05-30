import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import {
  applyOwnershipToList,
  ensureResourceOwnership,
  isResourceVisibleForRequestScope,
} from '../../platform/runtime/index.ts';
import { assertSafeRemoteDownloadUrl } from '../../platform/security/network-guards.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { assistantRepository } from './assistant.repository.ts';

type ScopeOptions = { scope?: DynamicValue };
type ParsedDataUrl = { mimeType: string; buffer: Buffer };
type AssistantAssetKind = 'image' | 'video';
type AssistantAssetPayload = {
  id: string;
  url?: DynamicValue;
  data?: DynamicValue;
  kind: AssistantAssetKind;
  scope?: DynamicValue;
};
type RemoteVideoCandidatePayload = {
  id: string;
  candidateUrls?: DynamicValue[];
  scope?: DynamicValue;
};

const MIME_MAP: Record<string, string> = {
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

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};
const REMOTE_VIDEO_TIMEOUT_MS = 30_000;
const REMOTE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const logger = createLogger({ module: 'assistant-service' });

function parseDataUrl(value: DynamicValue): ParsedDataUrl | null {
  const match = String(value || '').match(/^data:([^;]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildAssistantLocalUrl(directoryName: string, filename: string) {
  return `/api/assistant/files/${directoryName}/${filename}`;
}

function buildAssistantThumbnailUrl(directoryName: string, filename: string) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return `/api/outputs/${directoryName}/.thumbnails/${base}__thumb.jpg`;
}

async function downloadRemoteVideoCandidate(url: string) {
  await assertSafeRemoteDownloadUrl(url, '视频下载地址');

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REMOTE_VIDEO_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('video/')) {
    throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('Video exceeds size limit');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('Video exceeds size limit');
  }

  return { buffer, contentType };
}

export class AssistantService {
  repository;

  constructor(repository = assistantRepository) {
    this.repository = repository;
  }

  getStatus(_options: ScopeOptions = {}) {
    return { ok: true, version: '1.0.0' };
  }

  getConversations(options: ScopeOptions = {}) {
    const visible = this.repository
      .load('conversations')
      .filter((conversation) => isResourceVisibleForRequestScope(conversation, options.scope));
    return applyOwnershipToList(visible, options.scope);
  }

  saveConversations(conversations: DynamicValue[], options: ScopeOptions = {}) {
    this.repository.save('conversations', applyOwnershipToList(conversations, options.scope));
    logger.info('assistant conversations updated', { count: conversations.length });
  }

  deleteConversation(id: DynamicValue, _options: ScopeOptions = {}) {
    const next = this.repository
      .load('conversations')
      .filter(
        (conversation) => conversation.id !== id || !isResourceVisibleForRequestScope(conversation, _options.scope),
      );
    this.repository.save('conversations', next);
    logger.info('assistant conversation deleted', { conversationId: id });
  }

  getImages(options: ScopeOptions = {}) {
    const visible = this.repository
      .load('gallery')
      .filter((image) => isResourceVisibleForRequestScope(image, options.scope));
    return applyOwnershipToList(visible, options.scope);
  }

  async materializeRemoteVideoCandidates({ id, candidateUrls = [], scope = undefined }: RemoteVideoCandidatePayload) {
    const candidates = candidateUrls.map((value) => String(value || '').trim()).filter(Boolean);

    const seen = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);

      try {
        const { buffer, contentType } = await downloadRemoteVideoCandidate(candidate);
        const ext = VIDEO_MIME_EXT[contentType] || 'mp4';
        const filename = `${id}.${ext}`;
        this.repository.writeAssistantVideo(filename, buffer, { scope });
        logger.info('assistant video downloaded from remote candidate', {
          videoId: id,
          sourceUrl: candidate,
          contentType,
        });
        return buildAssistantLocalUrl('assistant-videos', filename);
      } catch (error) {
        logger.warn('assistant video candidate rejected', {
          videoId: id,
          sourceUrl: candidate,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return '';
  }

  materializeAssistantAsset({ id, url, data, kind, scope = undefined }: AssistantAssetPayload) {
    const isImage = kind === 'image';
    const directoryName = isImage ? 'assistant-images' : 'assistant-videos';
    const mimeExtMap = isImage ? IMAGE_MIME_EXT : VIDEO_MIME_EXT;
    const writeFile = isImage
      ? this.repository.writeAssistantImage.bind(this.repository)
      : this.repository.writeAssistantVideo.bind(this.repository);

    const inlineData = data || (/^data:(image|video)\//i.test(String(url || '')) ? url : '');
    if (inlineData) {
      const parsed = parseDataUrl(inlineData);
      if (parsed) {
        const ext = mimeExtMap[parsed.mimeType] || (isImage ? 'png' : 'mp4');
        const filename = `${id}.${ext}`;
        writeFile(filename, parsed.buffer, { scope });
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

  saveImage(body: PlainObject, options: ScopeOptions = {}) {
    const gallery = this.repository.load('gallery');
    const localUrl = this.materializeAssistantAsset({
      id: body.id,
      url: body.url || body.localUrl,
      data: body.data,
      kind: 'image',
      scope: options.scope,
    });

    const record = ensureResourceOwnership(
      {
        ...body,
        url: body.url || '',
        localUrl: localUrl || body.url || body.localUrl || null,
        thumbnailUrl: localUrl?.startsWith('/api/assistant/files/')
          ? buildAssistantThumbnailUrl('assistant-images', path.basename(localUrl))
          : '',
        storedAt: Date.now(),
      },
      options.scope,
    ) as PlainObject;
    record.data = undefined;

    gallery.push(record);
    this.repository.save('gallery', gallery);
    logger.info('assistant image stored', { imageId: body.id, localUrl: record.localUrl });
    return { localUrl: record.localUrl, thumbnailUrl: record.thumbnailUrl || '' };
  }

  clearImages(_options: ScopeOptions = {}) {
    const next = this.repository
      .load('gallery')
      .filter((entry) => !isResourceVisibleForRequestScope(entry, _options.scope));
    this.repository.save('gallery', next);
  }

  deleteImage(id: DynamicValue, _options: ScopeOptions = {}) {
    const gallery = this.repository.load('gallery');
    const item = gallery.find((entry) => entry.id === id && isResourceVisibleForRequestScope(entry, _options.scope));
    if (item?.localUrl?.startsWith('/api/assistant/files/')) {
      const rel = item.localUrl.replace('/api/assistant/files/', '');
      this.repository.deleteGeneratedFile(rel, { scope: _options.scope });
    }
    this.repository.save(
      'gallery',
      gallery.filter((entry) => entry.id !== id || !isResourceVisibleForRequestScope(entry, _options.scope)),
    );
    logger.info('assistant image deleted', { imageId: id });
  }

  getVideos(options: ScopeOptions = {}) {
    const visible = this.repository
      .load('videos')
      .filter((video) => isResourceVisibleForRequestScope(video, options.scope));
    return applyOwnershipToList(visible, options.scope);
  }

  async saveVideo(video: PlainObject, options: ScopeOptions = {}) {
    const videos = this.repository.load('videos');
    let localUrl = '';

    if (Array.isArray(video.candidateUrls) && video.candidateUrls.length > 0) {
      localUrl = await this.materializeRemoteVideoCandidates({
        id: video.id,
        candidateUrls: video.candidateUrls,
        scope: options.scope,
      });
    }

    if (!localUrl) {
      localUrl = this.materializeAssistantAsset({
        id: video.id,
        url: video.url || video.localUrl,
        data: video.data,
        kind: 'video',
        scope: options.scope,
      });
    }

    const record = ensureResourceOwnership(
      {
        ...video,
        url: video.url || '',
        localUrl: localUrl || video.url || video.localUrl || null,
        storedAt: Date.now(),
      },
      options.scope,
    ) as PlainObject;
    record.data = undefined;

    videos.push(record);
    this.repository.save('videos', videos);
    logger.info('assistant video stored', { videoId: video.id, localUrl: record.localUrl });
    return { localUrl: record.localUrl };
  }

  clearVideos(_options: ScopeOptions = {}) {
    const next = this.repository
      .load('videos')
      .filter((video) => !isResourceVisibleForRequestScope(video, _options.scope));
    this.repository.save('videos', next);
  }

  deleteVideo(id: DynamicValue, _options: ScopeOptions = {}) {
    const videos = this.repository.load('videos');
    const item = videos.find((video) => video.id === id && isResourceVisibleForRequestScope(video, _options.scope));
    if (item?.localUrl?.startsWith('/api/assistant/files/')) {
      const rel = item.localUrl.replace('/api/assistant/files/', '');
      this.repository.deleteGeneratedFile(rel, { scope: _options.scope });
    }
    this.repository.save(
      'videos',
      videos.filter((video) => video.id !== id || !isResourceVisibleForRequestScope(video, _options.scope)),
    );
    logger.info('assistant video deleted', { videoId: id });
  }

  openGeneratedFile(relativePath: string, _options: ScopeOptions = {}) {
    const filePath = this.repository.resolveGeneratedFile(relativePath, { scope: _options.scope });
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
