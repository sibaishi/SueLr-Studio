import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { ensureScopedStorageDirectories } from '../../platform/storage/index.ts';
import { getMimeType, urlToLocalPath } from '../helpers/fileHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

function ensureUploadsDir(apiConfig: RuntimeApiConfig) {
  return ensureScopedStorageDirectories(apiConfig.scope).uploadsDir;
}

function dataUrlToBuffer(dataUrl: string) {
  const matches = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('无法解析 base64 图片数据');
  }

  return {
    buffer: Buffer.from(matches[2], 'base64'),
    mimeType: matches[1],
  };
}

async function imageSourceToBuffer(imageSource: DynamicValue, apiConfig: RuntimeApiConfig) {
  if (!imageSource) {
    throw new Error('未选择遮罩源图片');
  }

  const source = String(imageSource);

  if (source.startsWith('data:')) {
    return dataUrlToBuffer(source);
  }

  const localPath = urlToLocalPath(source, { scope: apiConfig.scope });
  if (localPath) {
    return {
      buffer: fs.readFileSync(localPath),
      mimeType: getMimeType(localPath),
    };
  }

  if (source.startsWith('file://')) {
    const filePath = source.slice(7);
    return {
      buffer: fs.readFileSync(filePath),
      mimeType: getMimeType(filePath),
    };
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`下载遮罩源图片失败: HTTP ${response.status}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || 'image/png',
    };
  }

  throw new Error('当前遮罩来源不受支持，请先使用已上传图片或远程图片链接');
}

function normalizeThreshold(value: DynamicValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 128;
  return Math.min(255, Math.max(0, Math.round(numeric)));
}

export async function execute(
  node: WorkflowNode,
  _inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const fileUrl = String(node.data?.fileUrl || '');
  const threshold = normalizeThreshold(node.data?.threshold);
  const invertMask = Boolean(node.data?.invertMask);

  sendProgress?.('读取遮罩源图片...');
  const { buffer } = await imageSourceToBuffer(fileUrl, apiConfig);
  const sourceImage = sharp(buffer, { failOn: 'none' });
  const metadata = await sourceImage.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) {
    throw new Error('无法识别遮罩源图片尺寸');
  }

  const hasAlpha = Boolean(metadata.hasAlpha);
  sendProgress?.(hasAlpha ? '检测到透明通道，按 Alpha 转遮罩...' : '未检测到透明通道，按灰度转遮罩...');

  const maskSource = hasAlpha ? sourceImage.ensureAlpha().extractChannel('alpha') : sourceImage.grayscale();

  const binaryMaskBuffer = await maskSource
    .threshold(threshold, { grayscale: true })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const alphaChannel = Buffer.alloc(binaryMaskBuffer.length);
  for (let index = 0; index < binaryMaskBuffer.length; index += 1) {
    const whitePixel = binaryMaskBuffer[index] >= 128;
    const shouldEdit = invertMask ? !whitePixel : whitePixel;
    alphaChannel[index] = shouldEdit ? 0 : 255;
  }

  const rgbaBuffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .joinChannel(alphaChannel, {
      raw: {
        width,
        height,
        channels: 1,
      },
    })
    .png()
    .toBuffer();

  const uploadsDir = ensureUploadsDir(apiConfig);
  const filename = `${uuidv4()}_mask.png`;
  fs.writeFileSync(path.join(uploadsDir, filename), rgbaBuffer);

  sendProgress?.(`遮罩已生成: ${width} × ${height}; threshold=${threshold}; invert=${invertMask ? 'on' : 'off'}`);
  return { mask: `/api/files/${filename}` };
}
