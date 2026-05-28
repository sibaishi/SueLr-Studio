import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import type { RequestScope } from '../runtime/request-scope.ts';
import { ensureDir, getScopedStoragePaths, safeResolveWithin } from '../storage/index.ts';

const THUMBNAIL_MAX_WIDTH = 512;
const THUMBNAIL_MAX_HEIGHT = 512;
const THUMBNAIL_QUALITY = 82;

interface ThumbnailOptions {
  scope?: RequestScope;
}

interface UploadThumbnailInput {
  filename: string;
  sourcePath: string;
  mimeType?: string;
  scope?: RequestScope;
}

interface GeneratedThumbnailFromFileInput {
  relativePath: string;
  absolutePath: string;
  mimeType?: string;
  scope?: RequestScope;
}

interface GeneratedThumbnailFromBufferInput {
  relativePath: string;
  buffer: Buffer;
  mimeType?: string;
  scope?: RequestScope;
}

interface GeneratedThumbnailPath {
  absolutePath: string;
  relativePath: string;
}

interface UploadOriginal {
  absolutePath: string;
  filename: string;
  mimeType: string;
}

interface GeneratedOriginal {
  absolutePath: string;
  relativePath: string;
  mimeType: string;
}

function getThumbnailName(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return `${base}__thumb.jpg`;
}

function buildUrl(basePath: string, relativePath: string): string {
  return `${basePath}/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function shouldGenerateThumbnail(mimeType: unknown, filename: unknown): boolean {
  if (String(mimeType || '').startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(String(filename || ''));
}

export function getUploadThumbnailPath(filename: string, options: ThumbnailOptions = {}): string | null {
  const thumbnailsDir = path.join(getScopedStoragePaths(options.scope).uploadsDir, '.thumbnails');
  ensureDir(thumbnailsDir);
  return safeResolveWithin(thumbnailsDir, getThumbnailName(filename));
}

export function getGeneratedThumbnailPath(
  relativePath: string,
  options: ThumbnailOptions = {},
): GeneratedThumbnailPath | null {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const parsed = path.posix.parse(normalized);
  const thumbnailRelativePath = path.posix.join(parsed.dir, '.thumbnails', `${parsed.name}__thumb.jpg`);
  const absolutePath = safeResolveWithin(getScopedStoragePaths(options.scope).generatedDir, thumbnailRelativePath);
  if (!absolutePath) return null;
  ensureDir(path.dirname(absolutePath));
  return {
    absolutePath,
    relativePath: thumbnailRelativePath,
  };
}

export async function ensureUploadThumbnail({ filename, sourcePath, mimeType, scope = undefined }: UploadThumbnailInput): Promise<string> {
  if (!shouldGenerateThumbnail(mimeType, filename)) return '';

  const thumbnailPath = getUploadThumbnailPath(filename, { scope });
  if (!thumbnailPath) return '';

  await sharp(sourcePath)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(thumbnailPath);

  return buildUrl('/api/files/.thumbnails', path.basename(thumbnailPath));
}

export async function ensureGeneratedThumbnailFromFile({
  relativePath,
  absolutePath,
  mimeType,
  scope = undefined,
}: GeneratedThumbnailFromFileInput): Promise<string> {
  if (!shouldGenerateThumbnail(mimeType, relativePath)) return '';

  const target = getGeneratedThumbnailPath(relativePath, { scope });
  if (!target?.absolutePath) return '';

  await sharp(absolutePath)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(target.absolutePath);

  return buildUrl('/api/outputs', target.relativePath);
}

export async function ensureGeneratedThumbnailFromBuffer({
  relativePath,
  buffer,
  mimeType,
  scope = undefined,
}: GeneratedThumbnailFromBufferInput): Promise<string> {
  if (!shouldGenerateThumbnail(mimeType, relativePath)) return '';

  const target = getGeneratedThumbnailPath(relativePath, { scope });
  if (!target?.absolutePath) return '';

  await sharp(buffer)
    .rotate()
    .resize(THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(target.absolutePath);

  return buildUrl('/api/outputs', target.relativePath);
}

export function resolveUploadOriginalFromThumbnailName(
  thumbnailName: string,
  options: ThumbnailOptions = {},
): UploadOriginal | null {
  const match = String(thumbnailName || '').match(/^(.*)__thumb\.jpg$/i);
  if (!match) return null;
  const baseName = match[1];
  const uploadsDir = getScopedStoragePaths(options.scope).uploadsDir;
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

export function resolveGeneratedOriginalFromThumbnailRelativePath(
  relativePath: string,
  options: ThumbnailOptions = {},
): GeneratedOriginal | null {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const match = normalized.match(/^(.*?)(?:\/)?\.thumbnails\/([^/]+)__thumb\.jpg$/i);
  if (!match) return null;
  const [, directory = '', baseName] = match;
  const originalDirectory = directory || '';
  const absoluteDirectory = safeResolveWithin(getScopedStoragePaths(options.scope).generatedDir, originalDirectory);
  if (!absoluteDirectory || !fs.existsSync(absoluteDirectory)) return null;

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (parsed.name === baseName) {
      const originalRelativePath = path.posix.join(originalDirectory, entry.name).replace(/^\/+/, '');
      const absolutePath = safeResolveWithin(getScopedStoragePaths(options.scope).generatedDir, originalRelativePath);
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

export function deleteUploadThumbnail(filename: string, options: ThumbnailOptions = {}): void {
  const thumbnailPath = getUploadThumbnailPath(filename, options);
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    fs.unlinkSync(thumbnailPath);
  }
}

export function deleteGeneratedThumbnail(relativePath: string, options: ThumbnailOptions = {}): void {
  const target = getGeneratedThumbnailPath(relativePath, options);
  if (target?.absolutePath && fs.existsSync(target.absolutePath)) {
    fs.unlinkSync(target.absolutePath);
  }
}
