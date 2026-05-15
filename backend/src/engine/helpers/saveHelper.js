import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, STORAGE_PATHS, safeResolveWithin } from '../../platform/storage/index.js';

const TYPE_DIRS = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
  text: 'text',
  data: 'data',
};

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeSegment(value, fallback) {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function resolveBaseDir(customPath) {
  if (!customPath) return STORAGE_PATHS.generatedDir;
  return path.isAbsolute(customPath)
    ? customPath
    : path.join(PROJECT_ROOT, customPath);
}

function targetPath(type, options = {}, ext = 'txt') {
  const typeDir = TYPE_DIRS[type] || TYPE_DIRS.data;
  const prefix = safeSegment(options.prefix, type);
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dir = path.join(resolveBaseDir(options.outputPath), typeDir);
  ensureDir(dir);
  return path.join(dir, filename);
}

function toApiOutputUrl(filePath) {
  const normalizedDefaultDir = path.resolve(STORAGE_PATHS.generatedDir);
  const normalizedFilePath = path.resolve(filePath);
  const relativePath = path.relative(normalizedDefaultDir, normalizedFilePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return `/api/outputs/${relativePath.split(path.sep).join('/')}`;
}

function detectUrlType(value) {
  if (/^data:image\//i.test(value) || /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value)) return 'image';
  if (/^data:video\//i.test(value) || /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(value)) return 'video';
  if (/^data:audio\//i.test(value) || /\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(value)) return 'audio';
  return 'text';
}

function resolveLocalApiPath(value) {
  if (value.startsWith('/api/outputs/')) return safeResolveWithin(STORAGE_PATHS.generatedDir, value.replace('/api/outputs/', ''));
  if (value.startsWith('/api/files/')) return safeResolveWithin(STORAGE_PATHS.uploadsDir, value.replace('/api/files/', ''));
  if (value.startsWith('/api/assistant/files/')) return safeResolveWithin(STORAGE_PATHS.generatedDir, value.replace('/api/assistant/files/', ''));
  return null;
}

async function saveString(value, options) {
  if (value.startsWith('data:')) {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const type = detectUrlType(value);
      const ext = MIME_EXT[match[1]] || (type === 'image' ? 'png' : type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'bin');
      const filePath = targetPath(type, options, ext);
      fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
      return { type, path: filePath };
    }
  }

  const localApiPath = resolveLocalApiPath(value);
  if (localApiPath && fs.existsSync(localApiPath)) {
    const type = detectUrlType(value);
    const ext = path.extname(localApiPath).replace('.', '') || 'bin';
    const filePath = targetPath(type, options, ext);
    fs.copyFileSync(localApiPath, filePath);
    return { type, path: filePath };
  }

  // Keep remote URLs as text artifacts instead of fetching them again.
  const filePath = targetPath('text', options, 'txt');
  fs.writeFileSync(filePath, value, 'utf-8');
  return { type: 'text', path: filePath };
}

export async function saveContentByType(content, options = {}) {
  if (content === undefined || content === null) return [];

  if (Array.isArray(content)) {
    const results = [];
    for (const item of content) results.push(...await saveContentByType(item, options));
    return results;
  }

  if (typeof content === 'string') return [await saveString(content, options)];

  const filePath = targetPath('data', options, 'json');
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
  return [{ type: 'data', path: filePath }];
}

export async function materializeContentForOutput(content, options = {}) {
  const savedFiles = await saveContentByType(content, options);
  const savedPaths = savedFiles.map((file) => file.path);
  const urls = savedPaths.map(toApiOutputUrl).filter(Boolean);

  if (typeof content === 'string') {
    if (savedFiles.length === 1 && savedFiles[0]?.type !== 'text' && urls[0]) {
      return { content: urls[0], savedFiles, savedPaths };
    }
    return { content, savedFiles, savedPaths };
  }

  if (Array.isArray(content)) {
    const mappedContent = content.map((item, index) => {
      if (typeof item !== 'string') return item;
      const savedFile = savedFiles[index];
      const url = urls[index];
      return savedFile && savedFile.type !== 'text' && url ? url : item;
    });
    return { content: mappedContent, savedFiles, savedPaths };
  }

  return { content, savedFiles, savedPaths };
}

export const DEFAULT_OUTPUTS_DIR = STORAGE_PATHS.generatedDir;
