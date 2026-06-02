import fs from 'node:fs';
import sharp from 'sharp';
import { getMimeType, urlToLocalPath } from '../helpers/fileHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

type ImageSource = {
  buffer: Buffer;
  mimeType: string;
};

function dataUrlToBuffer(dataUrl: string): ImageSource {
  const matches = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('无法解析 Base64 图片数据');
  }

  return {
    buffer: Buffer.from(matches[2], 'base64'),
    mimeType: matches[1],
  };
}

async function imageSourceToBuffer(imageSource: DynamicValue, apiConfig: RuntimeApiConfig): Promise<ImageSource> {
  if (!imageSource) {
    throw new Error('图片拆分节点未接收到图片输入');
  }

  const source = String(imageSource);
  if (source.startsWith('data:')) return dataUrlToBuffer(source);

  const localPath = urlToLocalPath(source, { scope: apiConfig.scope });
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

  throw new Error('当前图片来源不支持拆分，请先使用已上传图片或 AI 生成结果');
}

function normalizeGridSize(value: DynamicValue, fallback: number, label: string) {
  const numeric = Number(value ?? fallback);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3) {
    throw new Error(`${label}必须是 1、2 或 3`);
  }
  return numeric;
}

function distributeSize(total: number, count: number) {
  const base = Math.floor(total / count);
  const sizes = Array.from({ length: count }, () => base);
  let remainder = total % count;
  let offset = 0;

  while (remainder > 0) {
    const index = offset % 2 === 0 ? count - 1 - Math.floor(offset / 2) : Math.floor(offset / 2);
    sizes[index] += 1;
    remainder -= 1;
    offset += 1;
  }

  return sizes;
}

function getOffsets(sizes: number[]) {
  let offset = 0;
  return sizes.map((size) => {
    const current = offset;
    offset += size;
    return current;
  });
}

function normalizeFormat(format: string | undefined, mimeType: string) {
  const value = String(format || mimeType.split('/')[1] || '').toLowerCase();
  if (value === 'jpg') return 'jpeg';
  return value;
}

function getMimeTypeForFormat(format: string) {
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'svg') return 'image/svg+xml';
  return `image/${format}`;
}

async function exportPart(pipeline: sharp.Sharp, preferredFormat: string) {
  try {
    const buffer = await pipeline
      .clone()
      .toFormat(preferredFormat as keyof sharp.FormatEnum)
      .toBuffer();
    return { buffer, format: preferredFormat };
  } catch {
    return {
      buffer: await pipeline.clone().png().toBuffer(),
      format: 'png',
    };
  }
}

function toDataUrl(buffer: Buffer, format: string) {
  return `data:${getMimeTypeForFormat(format)};base64,${buffer.toString('base64')}`;
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  const rows = normalizeGridSize(node.data?.rows, 3, '行数');
  const columns = normalizeGridSize(node.data?.columns, 3, '列数');

  onProgress?.('读取并校正图片方向...');
  const { buffer, mimeType } = await imageSourceToBuffer(inputs.image, apiConfig);
  const sourceMetadata = await sharp(buffer, { failOn: 'none' }).metadata();
  const preferredFormat = normalizeFormat(sourceMetadata.format, mimeType);
  const orientedBuffer = await sharp(buffer, { failOn: 'none' }).rotate().toBuffer();
  const metadata = await sharp(orientedBuffer, { failOn: 'none' }).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) {
    throw new Error('无法识别原图尺寸');
  }
  if (width < columns || height < rows) {
    throw new Error(`图片尺寸 ${width}x${height} 小于拆分网格 ${columns}x${rows}，每块图片必须至少为 1px x 1px`);
  }

  const widths = distributeSize(width, columns);
  const heights = distributeSize(height, rows);
  const leftOffsets = getOffsets(widths);
  const topOffsets = getOffsets(heights);
  const result: Record<string, string> = {};

  onProgress?.(`按 ${rows}x${columns} 网格拆分图片...`);
  let part = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pipeline = sharp(orientedBuffer, { failOn: 'none' }).extract({
        left: leftOffsets[column],
        top: topOffsets[row],
        width: widths[column],
        height: heights[row],
      });
      const output = await exportPart(pipeline, preferredFormat);
      result[`part${part}`] = toDataUrl(output.buffer, output.format);
      part += 1;
    }
  }

  return result;
}
