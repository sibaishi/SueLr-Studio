import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { getMimeType, urlToLocalPath } from '../helpers/fileHelper.js';
import { STORAGE_PATHS, ensureStorageDirectories } from '../../platform/storage/index.js';

const UPLOADS_DIR = STORAGE_PATHS.uploadsDir;

function ensureUploadsDir() {
  ensureStorageDirectories();
}

function dataUrlToBuffer(dataUrl) {
  const matches = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('无法解析 base64 图片数据');
  }

  return {
    buffer: Buffer.from(matches[2], 'base64'),
    mimeType: matches[1],
  };
}

async function imageSourceToBuffer(imageSource) {
  if (!imageSource) {
    throw new Error('图像缩放节点未接收到图片输入');
  }

  const source = String(imageSource);

  if (source.startsWith('data:')) {
    return dataUrlToBuffer(source);
  }

  const localPath = urlToLocalPath(source);
  if (localPath) {
    return {
      buffer: fs.readFileSync(localPath),
      mimeType: getMimeType(localPath),
    };
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`下载图片失败: HTTP ${response.status}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || 'image/png',
    };
  }

  throw new Error('当前图像来源不支持缩放，请先使用已上传图片或 AI 生成结果');
}

function normalizeOutputFormat(format) {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'jpg') return 'jpeg';
  if (normalized === 'png' || normalized === 'jpeg' || normalized === 'webp') return normalized;
  return 'png';
}

function getFileExtension(format) {
  return format === 'jpeg' ? 'jpg' : format;
}

async function resizeSingleImage(imageSource, node, sendProgress, progressPrefix = '') {
  const resizeMode = String(node.data?.resizeMode || 'percent');
  const scalePercent = Number(node.data?.scalePercent || 100);
  const targetWidth = Number(node.data?.targetWidth || 0);
  const targetHeight = Number(node.data?.targetHeight || 0);

  sendProgress?.(`${progressPrefix}读取图片...`);
  const { buffer, mimeType } = await imageSourceToBuffer(imageSource);
  const sourceImage = sharp(buffer, { failOn: 'none' });
  const metadata = await sourceImage.metadata();
  const sourceWidth = Number(metadata.width || 0);
  const sourceHeight = Number(metadata.height || 0);

  if (!sourceWidth || !sourceHeight) {
    throw new Error('无法识别原图尺寸');
  }

  let pipeline = sharp(buffer, { failOn: 'none' });
  let nextWidth = sourceWidth;
  let nextHeight = sourceHeight;

  if (resizeMode === 'percent') {
    if (!Number.isFinite(scalePercent) || scalePercent <= 0) {
      throw new Error('缩放比例必须大于 0');
    }

    nextWidth = Math.max(1, Math.round(sourceWidth * (scalePercent / 100)));
    nextHeight = Math.max(1, Math.round(sourceHeight * (scalePercent / 100)));
    pipeline = pipeline.resize(nextWidth, nextHeight);
    sendProgress?.(`${progressPrefix}按 ${scalePercent}% 缩放到 ${nextWidth} × ${nextHeight}`);
  } else if (resizeMode === 'dimensions') {
    if (targetWidth <= 0 && targetHeight <= 0) {
      throw new Error('按尺寸缩放时，至少需要填写宽度或高度');
    }

    pipeline = pipeline.resize({
      width: targetWidth > 0 ? Math.round(targetWidth) : undefined,
      height: targetHeight > 0 ? Math.round(targetHeight) : undefined,
      fit: 'inside',
      withoutEnlargement: false,
    });

    const resizedBuffer = await pipeline.toBuffer();
    const resizedMeta = await sharp(resizedBuffer, { failOn: 'none' }).metadata();
    nextWidth = Number(resizedMeta.width || 0);
    nextHeight = Number(resizedMeta.height || 0);
    pipeline = sharp(resizedBuffer, { failOn: 'none' });
    sendProgress?.(`${progressPrefix}按尺寸缩放到 ${nextWidth || '?'} × ${nextHeight || '?'}（锁定宽高比）`);
  } else {
    throw new Error('不支持的缩放模式');
  }

  const outputFormat = normalizeOutputFormat(metadata.format || mimeType.split('/')[1] || 'png');
  const outputBuffer = await pipeline.toFormat(outputFormat).toBuffer();

  ensureUploadsDir();
  const filename = `${uuidv4()}_resized.${getFileExtension(outputFormat)}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), outputBuffer);

  return {
    image: `/api/files/${filename}`,
    width: nextWidth,
    height: nextHeight,
  };
}

export async function execute(node, inputs, _apiConfig, sendProgress) {
  const imageInput = inputs.image;
  const resizeMode = String(node.data?.resizeMode || 'percent');

  if (Array.isArray(imageInput)) {
    if (imageInput.length === 0) {
      throw new Error('图像缩放节点未接收到图片输入');
    }

    if (resizeMode !== 'percent') {
      throw new Error('图像组仅支持按百分比缩放');
    }

    const results = [];
    for (let index = 0; index < imageInput.length; index += 1) {
      const progressPrefix = imageInput.length > 1 ? `处理第 ${index + 1}/${imageInput.length} 张图片：` : '';
      const result = await resizeSingleImage(imageInput[index], node, sendProgress, progressPrefix);
      results.push(result.image);
    }

    return {
      image: results,
    };
  }

  return resizeSingleImage(imageInput, node, sendProgress);
}
