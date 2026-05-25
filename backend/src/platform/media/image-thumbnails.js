import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import { ensureDir, safeResolveWithin, STORAGE_PATHS } from '../storage/index.js';

const THUMBNAIL_MAX_WIDTH = 512;
const THUMBNAIL_MAX_HEIGHT = 512;
const THUMBNAIL_QUALITY = 82;

function getThumbnailName(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return `${base}__thumb.jpg`;
}

function buildUrl(basePath, relativePath) {
  return `${basePath}/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function shouldGenerateThumbnail(mimeType, filename) {
  if (String(mimeType || '').startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(String(filename || ''));
}

export function getUploadThumbnailPath(filename) {
  const thumbnailsDir = path.join(STORAGE_PATHS.uploadsDir, '.thumbnails');
  ensureDir(thumbnailsDir);
  return safeResolveWithin(thumbnailsDir, getThumbnailName(filename));
}

export function getGeneratedThumbnailPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const parsed = path.posix.parse(normalized);
  const thumbnailRelativePath = path.posix.join(parsed.dir, '.thumbnails', `${parsed.name}__thumb.jpg`);
  const absolutePath = safeResolveWithin(STORAGE_PATHS.generatedDir, thumbnailRelativePath);
  if (!absolutePath) return null;
  ensureDir(path.dirname(absolutePath));
  return {
    absolutePath,
    relativePath: thumbnailRelativePath,
  };
}

export async function ensureUploadThumbnail({ filename, sourcePath, mimeType }) {
  if (!shouldGenerateThumbnail(mimeType, filename)) return '';

  const thumbnailPath = getUploadThumbnailPath(filename);
  if (!thumbnailPath) return '';

  await sharp(sourcePath)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(thumbnailPath);

  return buildUrl('/api/files/.thumbnails', path.basename(thumbnailPath));
}

export async function ensureGeneratedThumbnailFromFile({ relativePath, absolutePath, mimeType }) {
  if (!shouldGenerateThumbnail(mimeType, relativePath)) return '';

  const target = getGeneratedThumbnailPath(relativePath);
  if (!target?.absolutePath) return '';

  await sharp(absolutePath)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(target.absolutePath);

  return buildUrl('/api/outputs', target.relativePath);
}

export async function ensureGeneratedThumbnailFromBuffer({ relativePath, buffer, mimeType }) {
  if (!shouldGenerateThumbnail(mimeType, relativePath)) return '';

  const target = getGeneratedThumbnailPath(relativePath);
  if (!target?.absolutePath) return '';

  await sharp(buffer)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(target.absolutePath);

  return buildUrl('/api/outputs', target.relativePath);
}

export function resolveUploadOriginalFromThumbnailName(thumbnailName) {
  const match = String(thumbnailName || '').match(/^(.*)__thumb\.jpg$/i);
  if (!match) return null;
  const baseName = match[1];
  const uploadsDir = STORAGE_PATHS.uploadsDir;
  if (!fs.existsSync(uploadsDir)) return null;

  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (parsed.name === baseName) {
      const absolutePath = safeResolveWithin(uploadsDir, entry.name);
      if (!absolutePath) continue;
      return {
        absolutePath,
        filename: entry.name,
        mimeType: '',
      };
    }
  }

  return null;
}

export function resolveGeneratedOriginalFromThumbnailRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const match = normalized.match(/^(.*?)(?:\/)?\.thumbnails\/([^/]+)__thumb\.jpg$/i);
  if (!match) return null;
  const [, directory = '', baseName] = match;
  const originalDirectory = directory || '';
  const absoluteDirectory = safeResolveWithin(STORAGE_PATHS.generatedDir, originalDirectory);
  if (!absoluteDirectory || !fs.existsSync(absoluteDirectory)) return null;

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (parsed.name === baseName) {
      const originalRelativePath = path.posix.join(originalDirectory, entry.name).replace(/^\/+/, '');
      const absolutePath = safeResolveWithin(STORAGE_PATHS.generatedDir, originalRelativePath);
      if (!absolutePath) continue;
      return {
        absolutePath,
        relativePath: originalRelativePath,
        mimeType: '',
      };
    }
  }

  return null;
}

export function deleteUploadThumbnail(filename) {
  const thumbnailPath = getUploadThumbnailPath(filename);
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    fs.unlinkSync(thumbnailPath);
  }
}

export function deleteGeneratedThumbnail(relativePath) {
  const target = getGeneratedThumbnailPath(relativePath);
  if (target?.absolutePath && fs.existsSync(target.absolutePath)) {
    fs.unlinkSync(target.absolutePath);
  }
}
