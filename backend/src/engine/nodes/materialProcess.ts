import fs from 'node:fs';
import sharp from 'sharp';
import { writeWorkflowRuntimeAsset } from '../../platform/storage/workflow-runtime-assets.ts';
import { fetchImageBuffer } from '../helpers/downloadRemoteImageFile.ts';
import { getMimeType, urlToLocalPath } from '../helpers/fileHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

type MaterialType = 'text' | 'image';

type ImageSource = {
  buffer: Buffer;
  mimeType: string;
};

type SharpPipeline = ReturnType<typeof sharp>;
type SharpFormat = Parameters<SharpPipeline['toFormat']>[0];

const IMAGE_PATH_PATTERN = /\.(?:avif|gif|heic|heif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const IMAGE_URL_PATTERN = /^(?:https?:\/\/|\/api\/|blob:)/i;

function trimSeparatorAdjacentNewlines(text: string) {
  return text.replace(/^[ \t]*(?:\r?\n)+/, '').replace(/(?:\r?\n)+[ \t]*$/, '');
}

function trimSeparatorLeadingNewlines(text: string) {
  return text.replace(/^[ \t]*(?:\r?\n)+/, '');
}

export function splitTextPreservingRemainder(sourceText: string, separator: string, outputCount: number) {
  const parts: string[] = [];
  let cursor = 0;

  for (let index = 0; index < outputCount - 1; index += 1) {
    const separatorIndex = sourceText.indexOf(separator, cursor);
    if (separatorIndex === -1) break;
    parts.push(trimSeparatorAdjacentNewlines(sourceText.slice(cursor, separatorIndex)));
    cursor = separatorIndex + separator.length;
  }

  parts.push(trimSeparatorLeadingNewlines(sourceText.slice(cursor)));
  return parts.filter((part) => part.length > 0);
}

function normalizeOutputCount(value: DynamicValue) {
  const numeric = Number(value ?? 2);
  return Math.max(1, Math.min(9, Number.isFinite(numeric) ? Math.trunc(numeric) : 2));
}

function normalizeGridSize(value: DynamicValue, fallback: number, label: string) {
  const numeric = Number(value ?? fallback);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3) {
    throw new Error(`${label}必须是 1、2 或 3`);
  }
  return numeric;
}

function unwrapMaterialValue(value: DynamicValue): DynamicValue {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { url?: unknown }).url === 'string'
  ) {
    return (value as { url: string }).url;
  }
  return value;
}

function classifyMaterialValue(value: DynamicValue): MaterialType | 'unknown' {
  const unwrapped = unwrapMaterialValue(value);
  if (typeof unwrapped !== 'string') return 'unknown';
  const source = unwrapped.trim();
  if (!source) return 'unknown';
  if (source.startsWith('data:image/') || IMAGE_URL_PATTERN.test(source) || IMAGE_PATH_PATTERN.test(source)) {
    return 'image';
  }
  return 'text';
}

function normalizeMaterialValues(value: DynamicValue) {
  const values = (Array.isArray(value) ? value.flat(Number.POSITIVE_INFINITY) : [value])
    .map(unwrapMaterialValue)
    .filter((item) => item !== undefined && item !== null && !(typeof item === 'string' && item.trim() === ''));
  if (values.length === 0) throw new Error('素材处理节点未接收到有效输入');
  return values;
}

export function selectMaterialValues(
  value: DynamicValue,
  configuredType: DynamicValue,
): { materialType: MaterialType; values: DynamicValue[] } {
  const values = normalizeMaterialValues(value);
  const requestedType = configuredType === 'text' || configuredType === 'image' ? configuredType : 'auto';

  if (requestedType !== 'auto') {
    const selectedValues = values.filter((item) => classifyMaterialValue(item) === requestedType);
    if (selectedValues.length === 0) {
      throw new Error(`素材处理节点未找到可处理的${requestedType === 'text' ? '文本' : '图像'}素材`);
    }
    return { materialType: requestedType, values: selectedValues };
  }

  const classified = values.map((item) => ({ item, type: classifyMaterialValue(item) }));
  const detectedTypes = new Set(classified.map(({ type }) => type));
  if (detectedTypes.has('unknown')) {
    throw new Error('素材处理节点包含无法识别的素材，请明确选择文本或图像类型');
  }
  if (detectedTypes.size !== 1) {
    throw new Error('素材处理节点检测到混合素材，请明确选择文本或图像类型');
  }
  return {
    materialType: classified[0].type as MaterialType,
    values: classified.map(({ item }) => item),
  };
}

export function resolveMaterialType(value: DynamicValue, configuredType: DynamicValue): MaterialType {
  return selectMaterialValues(value, configuredType).materialType;
}

function dataUrlToBuffer(dataUrl: string): ImageSource {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('无法解析 Base64 图片数据');
  return { buffer: Buffer.from(matches[2], 'base64'), mimeType: matches[1] };
}

async function imageSourceToBuffer(imageSource: DynamicValue, apiConfig: RuntimeApiConfig): Promise<ImageSource> {
  const source = String(imageSource || '');
  if (source.startsWith('data:')) return dataUrlToBuffer(source);

  const localPath = urlToLocalPath(source, { scope: apiConfig.scope });
  if (localPath) return { buffer: fs.readFileSync(localPath), mimeType: getMimeType(localPath) };

  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchImageBuffer(source, apiConfig.scope, apiConfig.abortSignal);
  }

  throw new Error('当前图片来源不支持拆分，请先使用已上传图片或 AI 生成结果');
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
  return value === 'jpg' ? 'jpeg' : value;
}

function getMimeTypeForFormat(format: string) {
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'svg') return 'image/svg+xml';
  return `image/${format}`;
}

async function exportPart(pipeline: SharpPipeline, preferredFormat: string) {
  try {
    return {
      buffer: await pipeline
        .clone()
        .toFormat(preferredFormat as SharpFormat)
        .toBuffer(),
      format: preferredFormat,
    };
  } catch {
    return { buffer: await pipeline.clone().png().toBuffer(), format: 'png' };
  }
}

async function splitImage(imageSource: DynamicValue, rows: number, columns: number, apiConfig: RuntimeApiConfig) {
  const runId = String(apiConfig.runId || '').trim();
  if (!runId) throw new Error('图片拆分缺少工作流运行上下文');
  const { buffer, mimeType } = await imageSourceToBuffer(imageSource, apiConfig);
  const sourceMetadata = await sharp(buffer, { failOn: 'none' }).metadata();
  const preferredFormat = normalizeFormat(sourceMetadata.format, mimeType);
  const orientedBuffer = await sharp(buffer, { failOn: 'none' }).rotate().toBuffer();
  const metadata = await sharp(orientedBuffer, { failOn: 'none' }).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) throw new Error('无法识别原图尺寸');
  if (width < columns || height < rows) {
    throw new Error(`图片尺寸 ${width}x${height} 小于拆分网格 ${columns}x${rows}，每块图片必须至少为 1px x 1px`);
  }

  const widths = distributeSize(width, columns);
  const heights = distributeSize(height, rows);
  const leftOffsets = getOffsets(widths);
  const topOffsets = getOffsets(heights);
  const results: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pipeline = sharp(orientedBuffer, { failOn: 'none' }).extract({
        left: leftOffsets[column],
        top: topOffsets[row],
        width: widths[column],
        height: heights[row],
      });
      const output = await exportPart(pipeline, preferredFormat);
      results.push(
        writeWorkflowRuntimeAsset(runId, output.buffer, getMimeTypeForFormat(output.format), apiConfig.scope),
      );
    }
  }
  return results;
}

export async function processMaterial(
  node: WorkflowNode,
  input: DynamicValue,
  apiConfig: RuntimeApiConfig,
  onProgress?: ProgressCallback,
) {
  const splitEnabled = node.data?.splitEnabled !== false;
  const iterateEnabled = node.data?.iterateEnabled === true;
  if (!splitEnabled && !iterateEnabled) {
    throw new Error('素材处理节点必须至少启用“拆分”或“逐项”之一');
  }

  const { materialType, values } = selectMaterialValues(input, node.data?.materialType);
  if (!splitEnabled) return Array.isArray(input) || values.length > 1 ? values : values[0];

  if (materialType === 'text') {
    const separator =
      typeof node.data?.separator === 'string' && node.data.separator.length > 0 ? node.data.separator : '\n';
    const outputCount = normalizeOutputCount(node.data?.outputCount);
    onProgress?.('拆分文本...');
    return values.flatMap((value) => splitTextPreservingRemainder(String(value), separator, outputCount));
  }

  const rows = normalizeGridSize(node.data?.rows, 3, '行数');
  const columns = normalizeGridSize(node.data?.columns, 3, '列数');
  onProgress?.(`按 ${rows}x${columns} 网格拆分图片...`);
  const results: string[] = [];
  for (const value of values) results.push(...(await splitImage(value, rows, columns, apiConfig)));
  return results;
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  return { result: await processMaterial(node, inputs.input, apiConfig, onProgress) };
}
