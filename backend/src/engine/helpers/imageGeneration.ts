import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '../../app/errors/index.js';
import { getProviderAdapter } from '../../platform/providers/index.js';
import { assertSafeRemoteDownloadUrl } from '../../platform/security/network-guards.js';
import { STORAGE_PATHS } from '../../platform/storage/index.js';
import { resolveModelRuntime } from './apiConfig.js';
import { fileToBase64 } from './fileHelper.js';
import {
  callImageEditApiWithAdapter as callDalleImageEditApiWithAdapter,
  imageSourceToBlob as dalleImageSourceToBlob,
} from './imageGenDalle.js';
import {
  buildGeminiImageGenerationConfig as buildGeminiConfig,
  buildGeminiImageParts as buildGeminiParts,
  callGeminiGenerateContentApi as callGeminiApi,
} from './imageGenGemini.js';
import {
  buildChatImageRequestBody,
  buildGenericImageRequestBody,
  callImageGenerationApiWithAdapter as callGenericImageGenerationApiWithAdapter,
  callImageGenerationViaChatApiWithAdapter as callGenericImageGenerationViaChatApiWithAdapter,
} from './imageGenGeneric.js';
import { extractImagesFromResponse } from './imageGenShared.js';
import { findProjectModel, normalizeProjectModels } from './projectModels.js';
import type { EndpointCategory, ProjectModel } from './projectModels.js';

// biome-ignore lint/suspicious/noExplicitAny: Provider payloads and upstream JSON are intentionally dynamic at this boundary.
type DynamicValue = any;
type LooseRecord = Record<string, DynamicValue>;
type ProgressCallback = ((message: string) => void) | undefined;
type ImageGenerationRequest = LooseRecord;
type RuntimeConfig = LooseRecord;
type ProviderAdapter = LooseRecord;
type ImagePayload = LooseRecord & {
  image: string[];
  mask: string;
  model: string;
  n: number;
  prompt: string;
  resolution?: string;
};
type SettledResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: DynamicValue };
type RejectedResult = { status: 'rejected'; reason: DynamicValue };
type PromptImageSizing = {
  prompt: string;
  ratio?: string;
  width?: number;
  height?: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIZE_BY_RATIO = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
};

const SUPPORTED_RATIOS = new Set(Object.keys(SIZE_BY_RATIO));
const PROMPT_RATIO_REGEX = /(^|[^\d])((?:1:1|16:9|9:16|4:3|3:4|3:2|2:3))(?![\d])/;
const PROMPT_DIMENSIONS_REGEX =
  /(^|[\s,，;；:：([{（【])(?:图片尺寸|画布尺寸|输出尺寸|分辨率|尺寸|大小|画布|宽高)?\s*(\d{2,5})\s*(?:px)?\s*(?:x|X|×|\*|by)\s*(\d{2,5})\s*(?:px)?(?=$|[\s,，.;；:：。！？!?、)\]}）】])/i;
const PROMPT_VERTICAL_REGEX = /(竖版|竖图|纵向|手机壁纸|手机海报|portrait|vertical|story|reels?|shorts?)/i;
const PROMPT_HORIZONTAL_REGEX = /(横版|横图|横向|宽屏|横幅|banner|landscape|widescreen|wide)/i;
const PROMPT_SQUARE_REGEX = /(方图|方形|头像|正方形|square|avatar)/i;

const ALLOWED_QUALITY = new Set(['low', 'medium', 'high', 'auto']);
const ALLOWED_FORMAT = new Set(['png', 'jpeg', 'webp']);
const ALLOWED_IMAGE_RESOLUTION = new Set(['auto', '512px', '1k', '2k', '4k']);
const IMAGE_RESOLUTION_SUFFIX_REGEX = /-(512px|1k|2k|4k)$/i;
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_IMAGE_ENDPOINT = '/v1/images/generations';
const DEFAULT_IMAGE_GENERATION_CONCURRENCY = {
  enabled: false,
  maxConcurrency: 5,
};

function normalizeWorkflowConcurrency(value: LooseRecord | undefined) {
  const enabled = value?.enabled === true;
  const parsedMaxConcurrency = Number(value?.maxConcurrency);
  const maxConcurrency =
    Number.isFinite(parsedMaxConcurrency) && parsedMaxConcurrency > 0
      ? Math.max(1, Math.round(parsedMaxConcurrency))
      : DEFAULT_IMAGE_GENERATION_CONCURRENCY.maxConcurrency;
  return {
    enabled,
    maxConcurrency: enabled ? maxConcurrency : 1,
  };
}

async function runWithConcurrency<T, TResult>(
  items: T[],
  worker: (item: T, index: number) => Promise<TResult>,
  maxConcurrency: number,
): Promise<TResult[]> {
  if (items.length === 0) return [];
  if (maxConcurrency <= 1) {
    const results = [];
    for (let index = 0; index < items.length; index += 1) {
      results.push(await worker(items[index], index));
    }
    return results;
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runSettledWithConcurrency<T, TResult>(
  items: T[],
  worker: (item: T, index: number) => Promise<TResult>,
  maxConcurrency: number,
): Promise<Array<SettledResult<TResult>>> {
  if (items.length === 0) return [];
  if (maxConcurrency <= 1) {
    const results: Array<SettledResult<TResult>> = [];
    for (let index = 0; index < items.length; index += 1) {
      try {
        results.push({ status: 'fulfilled', value: await worker(items[index], index) });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
    }
    return results;
  }

  const results = new Array<SettledResult<TResult>>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function cleanText(value: DynamicValue): string {
  return String(value || '').trim();
}

function roundToNearest16(value: DynamicValue): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(16, Math.round(numeric / 16) * 16);
}

function ceilToMultiple(value: DynamicValue, multiple = 16): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(multiple, Math.ceil(numeric / multiple) * multiple);
}

function normalizeTextInput(value: DynamicValue): string {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').join('\n');
  }
  return cleanText(value);
}

function isVolcengineArkRuntime(baseUrl: DynamicValue): boolean {
  const normalized = cleanText(baseUrl).toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3');
}

function getArkSeedreamMinimumPixels(modelId: DynamicValue): number | null {
  const normalized = cleanText(modelId).toLowerCase();
  if (!normalized.includes('seedream')) return null;
  if (/seedream-3-0|seedream-3\.0/.test(normalized)) return 512 * 512;
  if (/seedream-4-0|seedream-4\.0/.test(normalized)) return 1280 * 720;
  if (/seedream-(?:4-5|4\.5|5-0|5\.0)/.test(normalized)) return 2560 * 1440;
  return null;
}

function parsePixelSize(size: DynamicValue): { width: number; height: number; pixels: number } | null {
  const match = cleanText(size)
    .toLowerCase()
    .match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height, pixels: width * height };
}

function upscaleSizeToMinimumPixels(size: DynamicValue, minimumPixels: number): string | null {
  const parsed = parsePixelSize(size);
  if (!parsed || !minimumPixels || parsed.pixels >= minimumPixels) return null;
  const scale = Math.sqrt(minimumPixels / parsed.pixels);
  const width = ceilToMultiple(parsed.width * scale);
  const height = ceilToMultiple(parsed.height * scale);
  if (!width || !height) return null;
  return `${width}x${height}`;
}

function normalizeProviderImageSizing(payload: ImagePayload, runtimeConfig: RuntimeConfig): ImagePayload {
  if (!isVolcengineArkRuntime(runtimeConfig?.baseUrl)) return payload;
  const minimumPixels = getArkSeedreamMinimumPixels(payload.model);
  if (!minimumPixels || !payload.size) return payload;
  const nextSize = upscaleSizeToMinimumPixels(payload.size, minimumPixels);
  if (!nextSize) return payload;
  const [width, height] = nextSize.split('x').map((item) => Number(item));
  return {
    ...payload,
    size: nextSize,
    width,
    height,
    sizeSource: `${payload.sizeSource || 'auto'}:provider-minimum`,
  };
}

function getImageTimeoutMs(providerConfig: LooseRecord | undefined): number {
  const timeout = Number(providerConfig?.imageTimeoutMs);
  return Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout) : 300000;
}

function getSizeFromRatio(ratio: DynamicValue): string | undefined {
  return SIZE_BY_RATIO[ratio as keyof typeof SIZE_BY_RATIO] || undefined;
}

function normalizeImageResolution(value: DynamicValue): string {
  const normalized = cleanText(value).toLowerCase();
  return ALLOWED_IMAGE_RESOLUTION.has(normalized) ? normalized : '';
}

function getImageResolutionFromModel(modelId: DynamicValue): string {
  const match = cleanText(modelId).match(IMAGE_RESOLUTION_SUFFIX_REGEX);
  return match ? match[1].toLowerCase() : '';
}

function stripImageResolutionSuffix(modelId: DynamicValue): string {
  return cleanText(modelId).replace(IMAGE_RESOLUTION_SUFFIX_REGEX, '');
}

function isGeminiStyleImageModel(model: ProjectModel | null): boolean {
  if (!model) return false;
  if (model.endpointMode === 'custom') {
    return cleanText(model.customEndpoint).toLowerCase().includes(':generatecontent');
  }
  return model.endpointCategory === 'gemini-generate-content';
}

function resolveImageResolutionModel(
  modelId: DynamicValue,
  resolution: DynamicValue,
  projectModels: DynamicValue = [],
): string {
  const requestedResolution = normalizeImageResolution(resolution) || getImageResolutionFromModel(modelId);
  if (!requestedResolution || requestedResolution === 'auto') return modelId;

  const currentResolution = getImageResolutionFromModel(modelId);
  const baseModelId = stripImageResolutionSuffix(modelId);
  const targetModelId = `${baseModelId}-${requestedResolution}`;
  const currentModel = findProjectModel(projectModels, modelId);
  const baseModel = findProjectModel(projectModels, baseModelId);
  const targetModel = findProjectModel(projectModels, targetModelId);

  if (currentResolution === requestedResolution && currentModel?.configured && isGeminiStyleImageModel(currentModel)) {
    return currentModel.modelId;
  }
  if (isGeminiStyleImageModel(targetModel)) {
    return targetModel?.modelId || targetModelId;
  }
  if (isGeminiStyleImageModel(baseModel)) {
    return targetModelId;
  }

  if (currentResolution === requestedResolution && baseModel?.configured && baseModel.type === 'image') {
    return baseModel.modelId;
  }

  return baseModelId || modelId;
}

function getImageResolutionFallbackModel(modelId: DynamicValue, resolution?: DynamicValue): string {
  const requestedResolution = normalizeImageResolution(resolution) || getImageResolutionFromModel(modelId);
  if (!requestedResolution || requestedResolution === 'auto') return '';
  const fallbackModel = stripImageResolutionSuffix(modelId);
  return fallbackModel && fallbackModel !== modelId ? fallbackModel : '';
}

function shouldSendResolutionInBody(modelId: DynamicValue, resolution: DynamicValue): boolean {
  const requestedResolution = normalizeImageResolution(resolution);
  return Boolean(requestedResolution && requestedResolution !== 'auto' && !getImageResolutionFromModel(modelId));
}

function resolveModelRuntimeAllowingResolutionSuffix(
  runtimeConfig: RuntimeConfig,
  modelId: DynamicValue,
  options: LooseRecord = {},
) {
  try {
    return resolveModelRuntime(runtimeConfig, modelId, options);
  } catch (error) {
    const requestedResolution = normalizeImageResolution(options.resolution);
    if (requestedResolution && requestedResolution !== 'auto' && !getImageResolutionFromModel(modelId)) {
      const suffixModel = `${stripImageResolutionSuffix(modelId)}-${requestedResolution}`;
      const resolvedSuffix = resolveModelRuntime(runtimeConfig, suffixModel, options);
      if (resolvedSuffix.endpoint?.includes(encodeURIComponent(suffixModel))) {
        return {
          ...resolvedSuffix,
          endpoint: resolvedSuffix.endpoint.replace(encodeURIComponent(suffixModel), encodeURIComponent(modelId)),
        };
      }
      return resolvedSuffix;
    }

    const fallbackModel = getImageResolutionFallbackModel(modelId);
    if (!fallbackModel) throw error;
    const resolved = resolveModelRuntime(runtimeConfig, fallbackModel, options);
    if (resolved.endpoint?.includes(encodeURIComponent(fallbackModel))) {
      return {
        ...resolved,
        endpoint: resolved.endpoint.replace(encodeURIComponent(fallbackModel), encodeURIComponent(modelId)),
      };
    }
    return resolved;
  }
}

function parseInteger(value: DynamicValue): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizePromptAfterRemovingSizing(text: string): string {
  return text
    .replace(PROMPT_DIMENSIONS_REGEX, '$1')
    .replace(PROMPT_RATIO_REGEX, '$1')
    .replace(/(?:图片尺寸|画布尺寸|输出尺寸|分辨率|尺寸|大小|画布|宽高)\s*[:：]\s*([。！？!?、,，.;；])?/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*([,，;；])\s*/g, '$1')
    .replace(/\s*([。！？!?、])\s*/g, '$1')
    .replace(/([,，;；])([。！？!?、])/g, '$2')
    .replace(/^[,，;；。！？!?、\s]+|[,，;；。！？!?、\s]+$/g, '')
    .trim();
}

export function parsePromptImageSizing(prompt: DynamicValue): PromptImageSizing {
  const normalizedPrompt = normalizeTextInput(prompt);
  if (!normalizedPrompt) {
    return {
      prompt: '',
      ratio: undefined,
      width: undefined,
      height: undefined,
    };
  }

  const dimensionsMatch = normalizedPrompt.match(PROMPT_DIMENSIONS_REGEX);
  if (dimensionsMatch) {
    const width = roundToNearest16(dimensionsMatch[2]);
    const height = roundToNearest16(dimensionsMatch[3]);
    if (width && height) {
      const promptWithoutSizing = normalizePromptAfterRemovingSizing(normalizedPrompt);
      return {
        prompt: promptWithoutSizing || normalizedPrompt,
        ratio: undefined,
        width,
        height,
      };
    }
  }

  const ratioMatch = normalizedPrompt.match(PROMPT_RATIO_REGEX);
  if (ratioMatch && SUPPORTED_RATIOS.has(ratioMatch[2])) {
    const promptWithoutSizing = normalizePromptAfterRemovingSizing(normalizedPrompt);
    return {
      prompt: promptWithoutSizing || normalizedPrompt,
      ratio: ratioMatch[2],
      width: undefined,
      height: undefined,
    };
  }

  let ratio: string | undefined;
  if (PROMPT_SQUARE_REGEX.test(normalizedPrompt)) {
    ratio = '1:1';
  } else if (PROMPT_VERTICAL_REGEX.test(normalizedPrompt) && !PROMPT_HORIZONTAL_REGEX.test(normalizedPrompt)) {
    ratio = '9:16';
  } else if (PROMPT_HORIZONTAL_REGEX.test(normalizedPrompt) && !PROMPT_VERTICAL_REGEX.test(normalizedPrompt)) {
    ratio = '16:9';
  }

  return {
    prompt: normalizedPrompt,
    ratio,
    width: undefined,
    height: undefined,
  };
}

function validateSize(size: DynamicValue): void {
  if (!size) return;
  if (!/^\d+x\d+$/i.test(size)) {
    throw new Error('size 必须是类似 1024x1024 的宽高字符串');
  }
  const [width, height] = size
    .toLowerCase()
    .split('x')
    .map((item: string) => Number(item));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('size width and height must be numbers');
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error('size 的宽和高都必须是 16 的倍数');
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const totalPixels = width * height;
  if (longEdge / shortEdge > 3) {
    throw new Error('size 长短边比例不能超过 3:1');
  }
  if (totalPixels < 655360) {
    throw new Error('size 总像素数不能低于允许范围');
  }
}

function normalizeImageArray(value: DynamicValue): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return [cleanText(value)].filter(Boolean);
}

function getSizing({
  ratio,
  roundedWidth,
  roundedHeight,
}: {
  ratio: string;
  roundedWidth?: number | null;
  roundedHeight?: number | null;
}) {
  const hasExplicitWidth = Number.isFinite(roundedWidth) && (roundedWidth || 0) > 0;
  const hasExplicitHeight = Number.isFinite(roundedHeight) && (roundedHeight || 0) > 0;
  const hasExplicitSize = hasExplicitWidth && hasExplicitHeight;
  const aspectRatio = ratio && ratio !== 'auto' ? ratio : undefined;

  if (hasExplicitSize) {
    const width = roundedWidth || 0;
    const height = roundedHeight || 0;
    return {
      size: `${width}x${height}`,
      aspect_ratio: undefined,
      sizeSource: 'dimensions',
    };
  }

  const size = getSizeFromRatio(ratio);
  return {
    size,
    aspect_ratio: size ? undefined : aspectRatio,
    sizeSource: aspectRatio ? 'ratio' : 'auto',
  };
}

export function normalizeImageGenerationRequest(request: ImageGenerationRequest = {}): ImagePayload {
  const rawPrompt = normalizeTextInput(request.prompt);
  const model = cleanText(request.model);
  const requestedRatio = cleanText(request.ratio || 'auto') || 'auto';
  const requestedWidth = roundToNearest16(request.width);
  const requestedHeight = roundToNearest16(request.height);
  const hasRequestedSize = Boolean(requestedWidth && requestedHeight);
  const canUsePromptSizing = !hasRequestedSize && requestedRatio === 'auto';
  const promptSizing: PromptImageSizing = canUsePromptSizing
    ? parsePromptImageSizing(rawPrompt)
    : { prompt: rawPrompt };
  const prompt = promptSizing.prompt || rawPrompt;
  const ratio = canUsePromptSizing && promptSizing.ratio ? promptSizing.ratio : requestedRatio;
  const roundedWidth = hasRequestedSize ? requestedWidth : promptSizing.width;
  const roundedHeight = hasRequestedSize ? requestedHeight : promptSizing.height;
  const sizing = getSizing({ ratio, roundedWidth, roundedHeight });
  const size = sizing.size;
  const quality = cleanText(request.quality);
  const resolution = normalizeImageResolution(
    request.resolution || request.outputResolution || request.output_resolution,
  );
  const outputFormat = cleanText(request.output_format || request.outputFormat);
  const n = request.n === undefined || request.n === null || request.n === '' ? 1 : parseInteger(request.n);

  if (!prompt) throw new Error('缺少提示词 prompt');
  if (quality && !ALLOWED_QUALITY.has(quality)) throw new Error('quality 仅支持 low、medium、high、auto');
  if ((request.resolution || request.outputResolution || request.output_resolution) && !resolution) {
    throw new Error('resolution 仅支持 auto、512px、1k、2k、4k');
  }
  if (outputFormat && !ALLOWED_FORMAT.has(outputFormat)) throw new Error('output_format 仅支持 png、jpeg、webp');
  if (n === null || n <= 0) throw new Error('n 必须是正整数');
  validateSize(size);

  return {
    model,
    prompt,
    ratio,
    width: roundedWidth || undefined,
    height: roundedHeight || undefined,
    size,
    aspect_ratio: sizing.aspect_ratio,
    sizeSource: sizing.sizeSource,
    quality: quality || undefined,
    resolution: resolution && resolution !== 'auto' ? resolution : undefined,
    n,
    output_format: outputFormat || undefined,
    image: normalizeImageArray(request.image || request.referenceImages || request.reference),
    mask: cleanText(request.mask),
  };
}

function getImageOperation(request: ImagePayload): 'edit' | 'generate' {
  return request.image?.length || request.mask ? 'edit' : 'generate';
}

function endpointSupportsImageOperation(model: ProjectModel, operation: 'edit' | 'generate'): boolean {
  if (operation === 'generate') return true;
  if (model.endpointMode === 'custom') {
    const endpoint = cleanText(model.customEndpoint).toLowerCase();
    return (
      endpoint.includes('/chat/completions') ||
      endpoint.includes('/images/edits') ||
      endpoint.includes(':generatecontent')
    );
  }
  return (
    model.endpointCategory === 'image' ||
    model.endpointCategory === 'image-edit' ||
    model.endpointCategory === 'chat' ||
    model.endpointCategory === 'gemini-generate-content'
  );
}

export function resolveImageGenerationModel(request: ImagePayload, runtimeConfig: RuntimeConfig = {}): string {
  const requestedModel = cleanText(request.model);
  if (requestedModel) {
    const configuredModel = findProjectModel(runtimeConfig.projectModels || [], requestedModel);
    if (configuredModel?.configured && configuredModel.type === 'image') {
      return resolveImageResolutionModel(
        configuredModel.modelId,
        request.resolution,
        runtimeConfig.projectModels || [],
      );
    }
    return resolveImageResolutionModel(requestedModel, request.resolution, runtimeConfig.projectModels || []);
  }

  const operation = getImageOperation(request);
  const candidates = normalizeProjectModels(runtimeConfig.projectModels || [])
    .filter((model) => model.configured && model.enabled !== false && model.type === 'image')
    .filter((model) => endpointSupportsImageOperation(model, operation));

  if (candidates.length === 1) {
    return candidates[0].modelId;
  }

  if (candidates.length === 0) {
    throw new ValidationError(
      'IMAGE_MODEL_UNAVAILABLE',
      `No configured image model is available for ${operation === 'edit' ? 'image editing' : 'image generation'}.`,
      { operation, candidates: [] },
    );
  }

  const candidateSummary = candidates.map((model) => model.modelId).join(', ');
  throw new ValidationError(
    'IMAGE_MODEL_AMBIGUOUS',
    `Multiple image models are available for ${operation === 'edit' ? 'image editing' : 'image generation'}; please specify one: ${candidateSummary}`,
    {
      operation,
      candidates: candidates.map((model) => ({
        model: model.modelId,
        endpointMode: model.endpointMode,
        endpointCategory: model.endpointCategory,
        customEndpoint: model.customEndpoint,
      })),
    },
  );
}

function describeFetchError(error: DynamicValue): string {
  const message = error?.message || String(error);
  const causeMessage = error?.cause?.message ? `; cause=${error.cause.message}` : '';
  const code = error?.cause?.code || error?.code;
  const codeMessage = code ? `; code=${code}` : '';
  return `${message}${causeMessage}${codeMessage}`;
}

function stringifyForLog(value: DynamicValue): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isChatCompletionsEndpoint(endpoint: DynamicValue): boolean {
  return String(endpoint || '')
    .toLowerCase()
    .includes('/chat/completions');
}

function isGeminiGenerateContentEndpoint(endpoint: DynamicValue): boolean {
  return String(endpoint || '')
    .toLowerCase()
    .includes(':generatecontent');
}

function isRejectedResult<T>(result: SettledResult<T>): result is RejectedResult {
  return result.status === 'rejected';
}

function isFulfilledResult<T>(result: SettledResult<T>): result is { status: 'fulfilled'; value: T } {
  return result.status === 'fulfilled';
}

function errorMessage(error: DynamicValue): string {
  return error?.message || String(error);
}

function shouldRetryWithoutResponseFormat(error: DynamicValue): boolean {
  const message = String(error?.message || error || '');
  return (
    /response_format/i.test(message) &&
    /(unsupported|not supported|unknown|unrecognized|invalid|extra|cannot unmarshal|type|required|requ|不支持|未知|无效)/i.test(
      message,
    )
  );
}

function shouldRetryWithoutOutputFormat(error: DynamicValue): boolean {
  const message = String(error?.message || error || '');
  return (
    /output_format/i.test(message) &&
    /(unsupported|not supported|unknown|unrecognized|invalid|extra|cannot unmarshal|type|required|requ|不支持|未知|无效)/i.test(
      message,
    )
  );
}

function shouldRetryOptionalImageParamsOnGatewayError(error: DynamicValue): boolean {
  const message = String(error?.message || error || '');
  return /(Bad Gateway|\(502\)|\b502\b)/i.test(message);
}

async function downloadRemoteImage(
  url: string,
  sendProgress: ProgressCallback,
  externalSignal: AbortSignal | undefined,
): Promise<string> {
  sendProgress?.('正在下载生成结果...');

  await assertSafeRemoteDownloadUrl(url, '图片下载地址');

  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS)])
    : AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal, redirect: 'error' });
  } catch (error) {
    throw new Error(`下载图片失败: ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`下载图片失败: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > REMOTE_IMAGE_MAX_BYTES) {
    throw new Error('下载图片失败: 文件超过大小限制');
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
    throw new Error('下载图片失败: 文件超过大小限制');
  }
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function generateImages(
  request: ImageGenerationRequest,
  runtimeConfig: RuntimeConfig,
  sendProgress?: ProgressCallback,
) {
  const { apiKey, baseUrl, providerConfig } = runtimeConfig;
  const abortSignal = runtimeConfig.abortSignal;
  const workflowConcurrency = normalizeWorkflowConcurrency(runtimeConfig.workflowExecution);
  const adapter = getProviderAdapter();
  if (!apiKey) {
    throw new Error('Missing API key for image generation');
  }

  const normalized = normalizeImageGenerationRequest(request);
  normalized.resolution = normalized.resolution || getImageResolutionFromModel(normalized.model) || undefined;
  normalized.model = resolveImageGenerationModel(normalized, runtimeConfig);
  const timeoutMs = getImageTimeoutMs(providerConfig);

  const referenceImages: string[] = [];
  for (const image of normalized.image) {
    const encodedImage = await fileToBase64(image);
    if (encodedImage) referenceImages.push(encodedImage);
  }
  const mask = normalized.mask ? (await fileToBase64(normalized.mask)) || '' : '';

  const payload = normalizeProviderImageSizing(
    {
      ...normalized,
      image: referenceImages,
      mask,
    },
    runtimeConfig,
  );
  const includeResolutionInBody = shouldSendResolutionInBody(payload.model, payload.resolution);

  const requestCount = payload.n || 1;

  const sizeSummary = payload.size
    ? `${payload.size}${payload.sizeSource === 'dimensions' ? ' (宽高优先)' : ''}`
    : payload.aspect_ratio
      ? `${payload.aspect_ratio} (比例映射)`
      : 'auto';
  sendProgress?.(`开始生成图片: model=${payload.model}; size=${sizeSummary}; n=${requestCount}`);

  const runImageGenerationAttempt = async (index: number) => {
    sendProgress?.(`正在生成第 ${index + 1}/${requestCount} 张图片...`);

    const resolveImageEndpoint = (model: string, purpose: EndpointCategory = 'image') => {
      const { endpoint } = resolveModelRuntimeAllowingResolutionSuffix(runtimeConfig, model, {
        expectedType: 'image',
        purpose,
        resolution: payload.resolution,
      });
      return endpoint;
    };
    const imageEndpoint = resolveImageEndpoint(payload.model);
    const usesGeminiGenerateContent = isGeminiGenerateContentEndpoint(imageEndpoint);
    const usesChatPayload = isChatCompletionsEndpoint(imageEndpoint);
    const usesArkImageGenerationPayload =
      isVolcengineArkRuntime(baseUrl) && !usesChatPayload && !usesGeminiGenerateContent;
    const shouldUseEditEndpoint =
      (payload.image.length > 0 || payload.mask) &&
      !usesArkImageGenerationPayload &&
      !usesChatPayload &&
      !usesGeminiGenerateContent;

    const attemptData = shouldUseEditEndpoint
      ? await (async () => {
          const buildRequestBody = (options: LooseRecord = {}) => ({
            ...payload,
            model: options.model || payload.model,
            n: 1,
            resolution: options.includeResolution ? payload.resolution : undefined,
          });
          const callWithRequestBody = async (requestBody: ImagePayload) => {
            const endpoint = resolveImageEndpoint(requestBody.model, 'image-edit');
            const form = new FormData();
            form.append('model', requestBody.model);
            form.append('prompt', requestBody.prompt);
            if (requestBody.size) form.append('size', requestBody.size);
            if (requestBody.quality) form.append('quality', requestBody.quality);
            if (requestBody.resolution) form.append('resolution', requestBody.resolution);
            if (requestBody.output_format) form.append('output_format', requestBody.output_format);
            if (requestBody.n) form.append('n', String(requestBody.n));
            for (let imageIndex = 0; imageIndex < requestBody.image.length; imageIndex += 1) {
              const blob = await dalleImageSourceToBlob(requestBody.image[imageIndex]);
              if (blob) form.append('image', blob, `image_${imageIndex}.png`);
            }
            if (requestBody.mask) {
              const maskBlob = await dalleImageSourceToBlob(requestBody.mask);
              if (maskBlob) form.append('mask', maskBlob, 'mask.png');
            }
            const requestConfig = adapter.buildRawRequest({
              apiKey,
              providerConfig,
              baseUrl,
              endpoint,
              method: 'POST',
              headers: {},
              body: form,
            });
            (requestConfig.options.headers as Record<string, string | undefined>)['Content-Type'] = undefined;
            return callDalleImageEditApiWithAdapter(requestConfig, requestBody, timeoutMs, sendProgress, abortSignal);
          };

          return callWithRequestBody(buildRequestBody({ includeResolution: includeResolutionInBody }) as ImagePayload);
        })()
      : await (async () => {
          const endpoint = imageEndpoint;

          if (usesGeminiGenerateContent) {
            const buildRequestBody = () => {
              const generationConfig = buildGeminiConfig(payload, SUPPORTED_RATIOS);
              return {
                contents: [
                  {
                    parts: buildGeminiParts(payload.prompt, payload.image, payload),
                  },
                ],
                ...(generationConfig ? { generationConfig } : {}),
              };
            };
            const callWithModel = (model: string) =>
              callGeminiApi(
                adapter,
                baseUrl,
                resolveImageEndpoint(model),
                apiKey,
                buildRequestBody(),
                timeoutMs,
                sendProgress,
                abortSignal,
              );
            return callWithModel(payload.model);
          }

          if (usesChatPayload) {
            const callWithRequestBody = (requestBody: LooseRecord) => {
              const requestConfig = adapter.buildJsonRequest({
                apiKey,
                providerConfig,
                baseUrl,
                endpoint: resolveImageEndpoint(requestBody.model),
                method: 'POST',
                body: requestBody,
              });
              return callGenericImageGenerationViaChatApiWithAdapter(
                requestConfig,
                {
                  model: payload.model,
                  prompt: payload.prompt,
                  image: payload.image,
                  size: payload.size,
                  aspect_ratio: payload.aspect_ratio,
                  quality: payload.quality,
                  output_format: payload.output_format,
                  response_format: requestBody.response_format,
                },
                timeoutMs,
                sendProgress,
                abortSignal,
              );
            };

            try {
              return await callWithRequestBody(
                buildChatImageRequestBody(payload, true, true, {
                  includeResolution: includeResolutionInBody,
                }),
              );
            } catch (error) {
              if (shouldRetryWithoutOutputFormat(error)) {
                sendProgress?.('上游不支持 output_format，已忽略输出格式重试一次');
                return callWithRequestBody(
                  buildChatImageRequestBody(payload, true, false, {
                    includeResolution: includeResolutionInBody,
                  }),
                );
              }
              if (shouldRetryWithoutResponseFormat(error)) {
                sendProgress?.('上游不支持 response_format=url，已降级为默认返回格式重试一次');
                return callWithRequestBody(
                  buildChatImageRequestBody(payload, false, true, {
                    includeResolution: includeResolutionInBody,
                  }),
                );
              }
              throw error;
            }
          }

          const callWithRequestBody = (requestBody: LooseRecord) => {
            const requestConfig = adapter.buildJsonRequest({
              apiKey,
              providerConfig,
              baseUrl,
              endpoint: resolveImageEndpoint(requestBody.model),
              method: 'POST',
              body: requestBody,
            });
            return callGenericImageGenerationApiWithAdapter(
              requestConfig,
              requestBody,
              timeoutMs,
              sendProgress,
              abortSignal,
            );
          };

          try {
            return await callWithRequestBody(
              buildGenericImageRequestBody(payload, usesArkImageGenerationPayload, true, true, {
                includeResolution: includeResolutionInBody,
              }),
            );
          } catch (error) {
            const canRetryOutputFormat =
              Boolean(payload.output_format) &&
              (shouldRetryWithoutOutputFormat(error) || shouldRetryOptionalImageParamsOnGatewayError(error));
            if (canRetryOutputFormat) {
              sendProgress?.('Image endpoint retry: drop output_format after first failure');
              try {
                return await callWithRequestBody(
                  buildGenericImageRequestBody(payload, usesArkImageGenerationPayload, true, false, {
                    includeResolution: includeResolutionInBody,
                  }),
                );
              } catch (retryError) {
                if (
                  shouldRetryWithoutResponseFormat(retryError) ||
                  shouldRetryOptionalImageParamsOnGatewayError(retryError)
                ) {
                  sendProgress?.('Image endpoint retry: drop response_format after second failure');
                  return callWithRequestBody(
                    buildGenericImageRequestBody(payload, usesArkImageGenerationPayload, false, false, {
                      includeResolution: includeResolutionInBody,
                    }),
                  );
                }
                throw retryError;
              }
            }
            if (shouldRetryWithoutResponseFormat(error) || shouldRetryOptionalImageParamsOnGatewayError(error)) {
              sendProgress?.('Image endpoint retry: drop response_format after first failure');
              return callWithRequestBody(
                buildGenericImageRequestBody(payload, usesArkImageGenerationPayload, false, true, {
                  includeResolution: includeResolutionInBody,
                }),
              );
            }
            throw error;
          }
        })();

    return attemptData;
  };

  const attemptResults = await runSettledWithConcurrency(
    Array.from({ length: requestCount }, (_item, index) => index),
    (index) => runImageGenerationAttempt(index),
    workflowConcurrency.maxConcurrency,
  );
  const failedAttempts = attemptResults
    .map((result, index) => ({ result, index }))
    .filter((item): item is { result: RejectedResult; index: number } => isRejectedResult(item.result));
  if (failedAttempts.length > 0) {
    const failures = failedAttempts
      .map(({ result, index }) => `#${index + 1}: ${result.reason?.message || result.reason}`)
      .join('; ');
    sendProgress?.(`部分图片生成失败: ${failedAttempts.length}/${requestCount}; ${failures}`);
  }
  const rawData = attemptResults.filter(isFulfilledResult).map((result) => result.value);
  const rawImages = rawData.flatMap((attemptData) => extractImagesFromResponse(attemptData));

  if (rawImages.length === 0) {
    const failureSummary = failedAttempts
      .map(({ result, index }) => `#${index + 1}: ${result.reason?.message || result.reason}`)
      .join('; ');
    throw new Error(failureSummary || 'Image API did not return any images');
  }

  const shouldPersistGeneratedOutputs = runtimeConfig.persistGeneratedOutputs !== false;
  const processOutputImage = async (image: string) => {
    const imageStr = String(image);
    if (imageStr.startsWith('data:')) {
      try {
        const match = imageStr.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          if (!shouldPersistGeneratedOutputs) {
            return imageStr;
          }
          const ext = (match[1] || 'image/png').split('/').pop() || 'png';
          const fileName = `images/${randomUUID()}.${ext}`;
          const filePath = path.join(STORAGE_PATHS.generatedDir, fileName);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
          return `/api/outputs/${fileName}`;
        }
      } catch {
        return imageStr;
      }
      return undefined;
    }
    if (imageStr.startsWith('http://') || imageStr.startsWith('https://')) {
      try {
        const downloaded = await downloadRemoteImage(image, sendProgress, abortSignal);
        try {
          const match = downloaded.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            if (!shouldPersistGeneratedOutputs) {
              return downloaded;
            }
            const ext = (match[1] || 'image/png').split('/').pop() || 'png';
            const fileName = `images/${randomUUID()}.${ext}`;
            const filePath = path.join(STORAGE_PATHS.generatedDir, fileName);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
            return `/api/outputs/${fileName}`;
          }
        } catch {
          return downloaded;
        }
        return undefined;
      } catch (error) {
        sendProgress?.(`下载远程图片失败，已保留原始URL继续流程: ${String(image)}; ${errorMessage(error)}`);
        return String(image);
      }
    } else {
      throw new Error(`无法识别的图片返回格式: ${String(image).slice(0, 120)}`);
    }
  };

  const outputImageResults = await runSettledWithConcurrency(
    rawImages,
    (image) => processOutputImage(image),
    workflowConcurrency.maxConcurrency,
  );
  const failedOutputImages = outputImageResults
    .map((result, index) => ({ result, index }))
    .filter((item): item is { result: RejectedResult; index: number } => isRejectedResult(item.result));
  if (failedOutputImages.length > 0) {
    const failures = failedOutputImages
      .map(({ result, index }) => `#${index + 1}: ${result.reason?.message || result.reason}`)
      .join('; ');
    sendProgress?.(`部分图片结果处理失败: ${failedOutputImages.length}/${rawImages.length}; ${failures}`);
  }
  const outputImages = outputImageResults
    .filter(isFulfilledResult)
    .map((result) => result.value)
    .filter((image) => image !== undefined);

  if (outputImages.length === 0) {
    const failureSummary = failedOutputImages
      .map(({ result, index }) => `#${index + 1}: ${result.reason?.message || result.reason}`)
      .join('; ');
    throw new Error(failureSummary || 'Image API did not return any usable images');
  }

  return {
    images: outputImages,
    rawImages,
    request: payload,
    rawData,
  };
}

export { SIZE_BY_RATIO, getSizeFromRatio };
