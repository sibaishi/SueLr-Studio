// ============================================================
// Flow Studio - 文件辅助工具
// 将服务器上的文件转换为 base64（用于调 AI API）
// ============================================================

import fs from 'fs';
import path from 'path';
import { STORAGE_PATHS, safeResolveWithin } from '../../platform/storage/index.js';

const UPLOADS_DIR = STORAGE_PATHS.uploadsDir;
const OUTPUTS_DIR = STORAGE_PATHS.generatedDir;

function decodeUrlPathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function resolveUrlPath(baseDir, filename) {
  const resolvedName = String(filename || '')
    .split('/')
    .map(decodeUrlPathSegment)
    .join(path.sep);
  return safeResolveWithin(baseDir, resolvedName);
}

/**
 * 将服务器 URL 转换为本地文件路径
 * @param {string} url - 如 "/api/files/xxx.jpg" 或 "/api/outputs/xxx.png"
 * @returns {string|null} 本地文件路径
 */
export function urlToLocalPath(url) {
  if (!url || typeof url !== 'string') return null;

  // 服务器 URL
  if (url.startsWith('/api/files/')) {
    const filename = url.replace('/api/files/', '');
    const filePath = resolveUrlPath(UPLOADS_DIR, filename);
    // 安全检查
    if (filePath && fs.existsSync(filePath)) {
      return filePath;
    }
  }
  if (url.startsWith('/api/outputs/')) {
    const filename = url.replace('/api/outputs/', '');
    const filePath = resolveUrlPath(OUTPUTS_DIR, filename);
    if (filePath && fs.existsSync(filePath)) {
      return filePath;
    }
  }

  // 已经是本地路径
  if (url.startsWith('data:')) return null; // base64，不需要转换
  if (url.startsWith('http://') || url.startsWith('https://')) return null; // 远程 URL

  return null;
}

/**
 * MIME 类型映射
 */
export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/avi',
    '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 将文件 URL 转换为 base64 data URL
 * 如果已经是 base64，直接返回
 * 如果是远程 URL，返回原始 URL（AI API 可能支持）
 * 如果是本地服务器 URL，读取文件 → 转 base64
 * 
 * @param {string} url - 文件 URL
 * @returns {Promise<string>} base64 data URL 或原始远程 URL
 */
export async function fileToBase64(url) {
  if (!url) return null;

  // 已经是 base64
  if (url.startsWith('data:')) return url;

  // 浏览器本地 blob 预览地址只在前端会话内有效，后端无法读取
  if (url.startsWith('blob:')) {
    throw new Error('检测到浏览器本地预览文件，后端无法直接读取。请等待文件上传完成后再执行。');
  }

  // 远程 URL，直接返回（AI API 可能可以直接访问）
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // 本地服务器 URL → 读取文件 → 转 base64
  const localPath = urlToLocalPath(url);
  if (localPath) {
    const buffer = fs.readFileSync(localPath);
    const mime = getMimeType(localPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  // 无法识别的格式，原样返回
  return url;
}

/**
 * 判断 URL 是否为本地服务器文件
 */
export function isLocalFileUrl(url) {
  return url && typeof url === 'string' &&
    (url.startsWith('/api/files/') || url.startsWith('/api/outputs/'));
}

/**
 * 获取文件信息的简化版（不读文件内容）
 * @param {string} url
 * @returns {{ exists: boolean, size: number, mime: string } | null}
 */
export function getFileInfo(url) {
  const localPath = urlToLocalPath(url);
  if (!localPath) return null;

  try {
    const stat = fs.statSync(localPath);
    return {
      exists: true,
      size: stat.size,
      mime: getMimeType(localPath),
    };
  } catch {
    return null;
  }
}
