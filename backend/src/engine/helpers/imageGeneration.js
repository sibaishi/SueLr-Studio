import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileToBase64 } from './fileHelper.js';
import { resolveModelRuntime } from './apiConfig.js';
import { findProjectModel, normalizeProjectModels } from './projectModels.js';
import { getProviderAdapter } from '../../platform/providers/index.js';
import { assertSafeRemoteDownloadUrl } from '../../platform/security/network-guards.js';
import { STORAGE_PATHS } from '../../platform/storage/index.js';
import { ValidationError } from '../../app/errors/index.js';

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
const PROMPT_DIMENSIONS_REGEX = /(^|[\s,，;；:：([{（【])(?:图片尺寸|画布尺寸|输出尺寸|分辨率|尺寸|大小|画布|宽高)?\s*(\d{2,5})\s*(?:px)?\s*(?:x|X|×|\*|by)\s*(\d{2,5})\s*(?:px)?(?=$|[\s,，.;；:：。！？!?、)\]}）】])/i;
const PROMPT_VERTICAL_REGEX = /(竖版|竖图|纵向|手机壁纸|手机海报|portrait|vertical|story|reels?|shorts?)/i;
const PROMPT_HORIZONTAL_REGEX = /(横版|横图|横向|宽屏|横幅|banner|landscape|widescreen|wide)/i;
const PROMPT_SQUARE_REGEX = /(方图|方形|头像|正方形|square|avatar)/i;
const URL_RESPONSE_FORMAT = 'url';
const CHAT_URL_RESPONSE_FORMAT = { type: 'url' };

const ALLOWED_QUALITY = new Set(['low', 'medium', 'high', 'auto']);
const ALLOWED_FORMAT = new Set(['png', 'jpeg', 'webp']);
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_IMAGE_ENDPOINT = '/v1/images/generations';
const IMAGE_REQUEST_RETRY_DELAYS_MS = [1_000, 2_000];
const DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;charset=[^;,]+)?;base64,/i;
const DATA_URL_LOG_PREVIEW_LENGTH = 48;

function cleanText(value) {
  return String(value || '').trim();
}

function roundToNearest16(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(16, Math.round(numeric / 16) * 16);
}

function ceilToMultiple(value, multiple = 16) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(multiple, Math.ceil(numeric / multiple) * multiple);
}

function normalizeTextInput(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').join('\n');
  }
  return cleanText(value);
}

function buildChatImagePromptText(prompt, payload) {
  const lines = [];

  if (cleanText(prompt)) {
    lines.push('请以以下提示词帮我生成图片：');
    lines.push(cleanText(prompt));
  }

  if (payload.size) {
    lines.push(`尺寸：${payload.size}`);
  } else if (payload.aspect_ratio) {
    lines.push(`宽高比：${payload.aspect_ratio}`);
  }

  if (payload.quality) {
    lines.push(`质量：${payload.quality}`);
  }

  if (payload.output_format) {
    lines.push(`输出格式：${payload.output_format}`);
  }

  return lines.join('\n');
}

function buildChatImageContent(prompt, images, payload = {}) {
  const parts = [];
  const promptText = buildChatImagePromptText(prompt, payload);
  if (promptText) parts.push({ type: 'text', text: promptText });
  for (const image of images || []) {
    if (!image) continue;
    parts.push({ type: 'image_url', image_url: { url: image } });
  }
  return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;
}

function isVolcengineArkRuntime(baseUrl) {
  const normalized = cleanText(baseUrl).toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3');
}

function getArkSeedreamMinimumPixels(modelId) {
  const normalized = cleanText(modelId).toLowerCase();
  if (!normalized.includes('seedream')) return null;
  if (/seedream-3-0|seedream-3\.0/.test(normalized)) return 512 * 512;
  if (/seedream-4-0|seedream-4\.0/.test(normalized)) return 1280 * 720;
  if (/seedream-(?:4-5|4\.5|5-0|5\.0)/.test(normalized)) return 2560 * 1440;
  return null;
}

function parsePixelSize(size) {
  const match = cleanText(size).toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height, pixels: width * height };
}

function upscaleSizeToMinimumPixels(size, minimumPixels) {
  const parsed = parsePixelSize(size);
  if (!parsed || !minimumPixels || parsed.pixels >= minimumPixels) return null;
  const scale = Math.sqrt(minimumPixels / parsed.pixels);
  const width = ceilToMultiple(parsed.width * scale);
  const height = ceilToMultiple(parsed.height * scale);
  if (!width || !height) return null;
  return `${width}x${height}`;
}

function normalizeProviderImageSizing(payload, runtimeConfig) {
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

function buildGeminiImagePromptText(prompt, payload = {}) {
  const lines = [];
  if (cleanText(prompt)) {
    lines.push('Generate an image from this prompt:');
    lines.push(cleanText(prompt));
  }
  if (payload.size) lines.push(`Size: ${payload.size}`);
  if (payload.aspect_ratio) lines.push(`Aspect ratio: ${payload.aspect_ratio}`);
  if (payload.quality) lines.push(`Quality: ${payload.quality}`);
  if (payload.output_format) lines.push(`Output format: ${payload.output_format}`);
  return lines.join('\n');
}

function dataUrlToGeminiInlineData(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    data: match[2],
  };
}

function buildGeminiImageParts(prompt, images, payload = {}) {
  const parts = [];
  const promptText = buildGeminiImagePromptText(prompt, payload);
  if (promptText) parts.push({ text: promptText });
  for (const image of images || []) {
    if (!image) continue;
    const inlineData = dataUrlToGeminiInlineData(image);
    if (inlineData) {
      parts.push({ inlineData });
    } else if (String(image).startsWith('http://') || String(image).startsWith('https://')) {
      parts.push({ fileData: { mimeType: 'image/png', fileUri: image } });
    }
  }
  return parts;
}

function getImageTimeoutMs(providerConfig) {
  const timeout = Number(providerConfig?.imageTimeoutMs);
  return Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout) : 300000;
}

function getSizeFromRatio(ratio) {
  return SIZE_BY_RATIO[ratio] || undefined;
}

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizePromptAfterRemovingSizing(text) {
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

export function parsePromptImageSizing(prompt) {
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

  let ratio;
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

function validateSize(size) {
  if (!size) return;
  if (!/^\d+x\d+$/i.test(size)) {
    throw new Error('size 必须是类似 1024x1024 的宽高字符串');
  }
  const [width, height] = size.toLowerCase().split('x').map((item) => Number(item));
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

function normalizeImageArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return [cleanText(value)].filter(Boolean);
}

function getSizing({ ratio, roundedWidth, roundedHeight }) {
  const hasExplicitWidth = Number.isFinite(roundedWidth) && roundedWidth > 0;
  const hasExplicitHeight = Number.isFinite(roundedHeight) && roundedHeight > 0;
  const hasExplicitSize = hasExplicitWidth && hasExplicitHeight;
  const aspectRatio = ratio && ratio !== 'auto' ? ratio : undefined;

  if (hasExplicitSize) {
    return {
      size: `${roundedWidth}x${roundedHeight}`,
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

export function normalizeImageGenerationRequest(request = {}) {
  const rawPrompt = normalizeTextInput(request.prompt);
  const model = cleanText(request.model);
  const requestedRatio = cleanText(request.ratio || 'auto') || 'auto';
  const requestedWidth = roundToNearest16(request.width);
  const requestedHeight = roundToNearest16(request.height);
  const hasRequestedSize = Boolean(requestedWidth && requestedHeight);
  const canUsePromptSizing = !hasRequestedSize && requestedRatio === 'auto';
  const promptSizing = canUsePromptSizing ? parsePromptImageSizing(rawPrompt) : { prompt: rawPrompt };
  const prompt = promptSizing.prompt || rawPrompt;
  const ratio = canUsePromptSizing && promptSizing.ratio ? promptSizing.ratio : requestedRatio;
  const roundedWidth = hasRequestedSize ? requestedWidth : promptSizing.width;
  const roundedHeight = hasRequestedSize ? requestedHeight : promptSizing.height;
  const sizing = getSizing({ ratio, roundedWidth, roundedHeight });
  const size = sizing.size;
  const quality = cleanText(request.quality);
  const outputFormat = cleanText(request.output_format || request.outputFormat);
  const n = request.n === undefined || request.n === null || request.n === '' ? 1 : parseInteger(request.n);

  if (!prompt) throw new Error('缺少提示词 prompt');
  if (quality && !ALLOWED_QUALITY.has(quality)) throw new Error('quality 仅支持 low、medium、high、auto');
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
    n,
    output_format: outputFormat || undefined,
    image: normalizeImageArray(request.image || request.referenceImages || request.reference),
    mask: cleanText(request.mask),
  };
}

function getImageOperation(request) {
  return request.image?.length || request.mask ? 'edit' : 'generate';
}

function endpointSupportsImageOperation(model, operation) {
  if (operation === 'generate') return true;
  if (model.endpointMode === 'custom') {
    const endpoint = cleanText(model.customEndpoint).toLowerCase();
    return endpoint.includes('/chat/completions')
      || endpoint.includes('/images/edits')
      || endpoint.includes(':generatecontent');
  }
  return model.endpointCategory === 'image'
    || model.endpointCategory === 'image-edit'
    || model.endpointCategory === 'chat'
    || model.endpointCategory === 'gemini-generate-content';
}

export function resolveImageGenerationModel(request, runtimeConfig = {}) {
  const requestedModel = cleanText(request.model);
  if (requestedModel) {
    const configuredModel = findProjectModel(runtimeConfig.projectModels || [], requestedModel);
    if (configuredModel?.configured && configuredModel.type === 'image') {
      return configuredModel.modelId;
    }
    return requestedModel;
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

  const candidateSummary = candidates
    .map((model) => model.modelId)
    .join(', ');
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

function describeFetchError(error) {
  const message = error?.message || String(error);
  const causeMessage = error?.cause?.message ? `; cause=${error.cause.message}` : '';
  const code = error?.cause?.code || error?.code;
  const codeMessage = code ? `; code=${code}` : '';
  return `${message}${causeMessage}${codeMessage}`;
}

function stringifyForLog(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeInlineDataUrl(value) {
  const match = String(value).match(DATA_URL_PREFIX);
  if (!match) return value;

  return {
    kind: 'inline-data-url',
    mimeType: match[1] || 'application/octet-stream',
    encoding: 'base64',
    length: value.length,
    preview: `${value.slice(0, DATA_URL_LOG_PREVIEW_LENGTH)}...`,
  };
}

function sanitizeRequestDetailsForLog(value) {
  if (typeof value === 'string') {
    return value.startsWith('data:') ? summarizeInlineDataUrl(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRequestDetailsForLog(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, sanitizeRequestDetailsForLog(nestedValue)]),
  );
}

function summarizeFormData(form) {
  const summary = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      summary.push({ key, value });
      continue;
    }

    summary.push({
      key,
      filename: value?.name || 'blob',
      type: value?.type || 'application/octet-stream',
      size: typeof value?.size === 'number' ? value.size : null,
    });
  }
  return summary;
}

function logOutgoingRequest(sendProgress, details) {
  sendProgress?.(`[ImageRequest] ${stringifyForLog(sanitizeRequestDetailsForLog(details))}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFetchErrorCode(error) {
  return error?.cause?.code || error?.code || '';
}

function isRetryableImageRequestError(error) {
  const code = getFetchErrorCode(error);
  return code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ECONNRESET';
}

function isChatCompletionsEndpoint(endpoint) {
  return String(endpoint || '').toLowerCase().includes('/chat/completions');
}

function isGeminiGenerateContentEndpoint(endpoint) {
  return String(endpoint || '').toLowerCase().includes(':generatecontent');
}

function buildGeminiGenerateContentUrl(adapter, baseUrl, endpoint, apiKey) {
  const rawUrl = adapter.buildEndpoint(baseUrl, endpoint);
  const key = String(apiKey || '').replace(/[^\x20-\x7E]/g, '').trim();
  if (!key) return rawUrl;

  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('key')) {
      url.searchParams.set('key', key);
    }
    return url.toString();
  } catch {
    const separator = String(rawUrl).includes('?') ? '&' : '?';
    return String(rawUrl).includes('key=') ? rawUrl : `${rawUrl}${separator}key=${encodeURIComponent(key)}`;
  }
}

function shouldRetryWithoutResponseFormat(error) {
  const message = String(error?.message || error || '');
  return /response_format/i.test(message)
    && /(unsupported|not supported|unknown|unrecognized|invalid|extra|cannot unmarshal|type|required|requ|不支持|未知|无效)/i.test(message);
}

function shouldRetryWithoutOutputFormat(error) {
  const message = String(error?.message || error || '');
  return /output_format/i.test(message)
    && /(unsupported|not supported|unknown|unrecognized|invalid|extra|cannot unmarshal|type|required|requ|不支持|未知|无效)/i.test(message);
}

async function fetchWithImageTimeout(url, options, timeoutMs, externalSignal, sendProgress) {
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let lastError;
  const attempts = IMAGE_REQUEST_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...options,
        signal,
      });
    } catch (error) {
      lastError = error;
      const shouldRetry = !signal.aborted
        && isRetryableImageRequestError(error)
        && attempt < IMAGE_REQUEST_RETRY_DELAYS_MS.length;
      if (!shouldRetry) {
        throw error;
      }

      const retryDelayMs = IMAGE_REQUEST_RETRY_DELAYS_MS[attempt];
      sendProgress?.(`图像请求连接异常，${retryDelayMs}ms 后重试第 ${attempt + 2}/${attempts} 次: ${describeFetchError(error)}`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

async function downloadRemoteImage(url, sendProgress, externalSignal) {
  sendProgress?.('正在下载生成结果...');

  await assertSafeRemoteDownloadUrl(url, '图片下载地址');

  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS)])
    : AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS);

  let response;
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

function extractImagesFromResponse(data) {
  const images = [];
  const payload = data?.data && !Array.isArray(data.data) ? data.data : data;
  const pushImage = (value, mimeType = 'image/png', allowBareBase64 = false) => {
    const source = cleanText(value);
    if (!source) return;
    if (/^data:image\//i.test(source) || /^https?:\/\//i.test(source)) {
      images.push(source);
      return;
    }
    if (allowBareBase64 && /^[A-Za-z0-9+/=\s]+$/.test(source)) {
      images.push(`data:${mimeType || 'image/png'};base64,${source.replace(/\s+/g, '')}`);
    }
  };
  const collectNestedImages = (value, key = '') => {
    if (value === undefined || value === null) return;
    const normalizedKey = cleanText(key).toLowerCase();
    const isImageKey = /^(url|image|images|image_url|imageurl|output|outputs|output_url|outputurl|artifact|artifacts)$/.test(normalizedKey);
    const isBase64Key = /^(b64_json|base64|image_base64|imagebase64)$/.test(normalizedKey);

    if (typeof value === 'string') {
      if (/^data:image\//i.test(value) || isImageKey) pushImage(value);
      if (isBase64Key) pushImage(value, 'image/png', true);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectNestedImages(item, key));
      return;
    }

    if (typeof value !== 'object') return;

    const inlineData = value.inlineData || value.inline_data;
    const inlineMime = cleanText(inlineData?.mimeType || inlineData?.mime_type);
    const inlineBase64 = cleanText(inlineData?.data);
    if (inlineMime.startsWith('image/') && inlineBase64) {
      pushImage(inlineBase64, inlineMime, true);
    }

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      collectNestedImages(nestedValue, nestedKey);
    }
  };

  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item?.url) pushImage(item.url);
      if (item?.b64_json) pushImage(item.b64_json, 'image/png', true);
    }
  }

  if (Array.isArray(payload?.outputs)) {
    for (const output of payload.outputs) {
      if (typeof output === 'string') pushImage(output);
      if (output?.url) pushImage(output.url);
      if (output?.b64_json) pushImage(output.b64_json, 'image/png', true);
    }
  }

  if (Array.isArray(data?.candidates)) {
    for (const candidate of data.candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        const mimeType = cleanText(part?.inlineData?.mimeType);
        const base64 = cleanText(part?.inlineData?.data);
        if (mimeType.startsWith('image/') && base64) {
          pushImage(base64, mimeType, true);
        }
        const snakeMimeType = cleanText(part?.inline_data?.mime_type);
        const snakeBase64 = cleanText(part?.inline_data?.data);
        if (snakeMimeType.startsWith('image/') && snakeBase64) {
          pushImage(snakeBase64, snakeMimeType, true);
        }
      }
    }
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    const markdownImageRegex = /!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(content)) !== null) {
      pushImage(match[1]);
    }

    const base64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
    while ((match = base64Regex.exec(content)) !== null) {
      if (!images.includes(match[1])) {
        pushImage(match[1]);
      }
    }
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part?.image_url?.url) {
        pushImage(part.image_url.url);
      }
    }
  }

  collectNestedImages(data);

  return [...new Set(images)];
}

async function parseImageApiResponse(response, context, sendProgress) {
  const contentType = response.headers.get('content-type') || 'unknown';
  const contentLength = response.headers.get('content-length') || 'unknown';
  const readStart = Date.now();
  let responseText = '';

  sendProgress?.(`${context}响应头已收到: status=${response.status}; contentType=${contentType}; contentLength=${contentLength}`);

  try {
    responseText = await response.text();
  } catch (error) {
    sendProgress?.(`${context}响应体读取失败: elapsedMs=${Date.now() - readStart}; ${describeFetchError(error)}`);
    throw new Error(`${context}响应读取失败: contentType=${contentType}; ${describeFetchError(error)}`);
  }

  sendProgress?.(`${context}响应体读取完成: bytes=${responseText.length}; elapsedMs=${Date.now() - readStart}`);

  if (!responseText.trim()) {
    throw new Error(`${context}响应为空: contentType=${contentType}`);
  }

  try {
    const parsed = JSON.parse(responseText);
    const extractedImages = extractImagesFromResponse(parsed);
    const remoteUrls = extractedImages.filter((image) => /^https?:\/\//i.test(String(image)));
    if (remoteUrls.length > 0) {
      remoteUrls.forEach((url, index) => {
        sendProgress?.(`${context}返回图片URL[${index + 1}]: ${url}`);
      });
    } else if (extractedImages.some((image) => String(image).startsWith('data:'))) {
      sendProgress?.(`${context}返回了内联图片数据(data URL)，未展开完整内容到日志`);
    }
    return parsed;
  } catch {
    const preview = responseText.replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`${context}响应解析失败: contentType=${contentType}; preview=${preview}`);
  }
}

async function parseApiError(response) {
  const errorText = await response.text().catch(() => '未知错误');
  try {
    const payload = JSON.parse(errorText);
    return String(payload.error?.message || payload.message || '上游服务返回错误').replace(/\s+/g, ' ').slice(0, 120);
  } catch {
    return String(errorText || '上游服务返回错误').replace(/\s+/g, ' ').slice(0, 120);
  }
}

function dataUrlToBlob(dataUrl) {
  const matches = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    return new Blob([dataUrl], { type: 'application/octet-stream' });
  }
  const mime = matches[1] || 'application/octet-stream';
  const buffer = Buffer.from(matches[2], 'base64');
  return new Blob([buffer], { type: mime });
}

async function imageSourceToBlob(imageSource) {
  if (!imageSource) return null;
  if (String(imageSource).startsWith('data:')) {
    return dataUrlToBlob(imageSource);
  }
  if (String(imageSource).startsWith('http://') || String(imageSource).startsWith('https://')) {
    await assertSafeRemoteDownloadUrl(imageSource, '编辑图片地址');
    const response = await fetch(imageSource, {
      signal: AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`下载编辑图片失败: HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error('下载编辑图片失败: 文件超过大小限制');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error('下载编辑图片失败: 文件超过大小限制');
    }

    return new Blob([buffer], {
      type: response.headers.get('content-type') || 'application/octet-stream',
    });
  }
  return new Blob([imageSource], { type: 'application/octet-stream' });
}

async function callImageGenerationApi(url, headers, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在调用图像生成接口: ${url}`);
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url,
    method: 'POST',
    body: payload,
  });
  let response;
  try {
    response = await fetchWithImageTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`图像生成请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像生成', sendProgress);
}

async function callImageGenerationApiWithAdapter(adapter, request, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在调用图像生成接口: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url: request.url,
    method: 'POST',
    body: payload,
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      request.url,
      request.options,
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`图像生成请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMessage}`);
  }

  return parseImageApiResponse(response, '图像生成', sendProgress);
}

async function callImageGenerationViaChatApiWithAdapter(adapter, request, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在通过对话接口生成图片: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url: request.url,
    method: 'POST',
    body: JSON.parse(request.options.body),
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      request.url,
      request.options,
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`对话生图请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`对话生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '对话生图', sendProgress);
}

async function callGeminiGenerateContentApi(adapter, baseUrl, endpoint, apiKey, payload, timeoutMs, sendProgress, externalSignal) {
  const url = buildGeminiGenerateContentUrl(adapter, baseUrl, endpoint, apiKey);
  const safeUrl = url.replace(/([?&]key=)[^&]+/i, '$1***');
  sendProgress?.(`正在通过 Gemini generateContent 接口生成图片: ${safeUrl}`);
  logOutgoingRequest(sendProgress, {
    type: 'gemini-generate-content',
    url: safeUrl,
    method: 'POST',
    body: payload,
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`Gemini 生图请求失败: timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`Gemini 生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }

  return parseImageApiResponse(response, 'Gemini 生图', sendProgress);
}

async function callImageEditApiWithAdapter(adapter, request, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在调用图像编辑接口: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'form-data',
    url: request.url,
    method: 'POST',
    body: summarizeFormData(request.options.body),
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      request.url,
      request.options,
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`图像编辑请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像编辑 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像编辑', sendProgress);
}

async function callImageGenerationViaChatApi(url, headers, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在通过对话接口生成图片: ${url}`);
  const body = {
    model: payload.model,
    stream: false,
    messages: [
      {
        role: 'user',
        content: buildChatImageContent(payload.prompt, payload.image, payload),
      },
    ],
  };
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url,
    method: 'POST',
    body,
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`对话生图请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`对话生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '对话生图', sendProgress);
}

async function callImageEditApi(url, headers, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在调用图像编辑接口: ${url}`);
  const form = new FormData();
  form.append('model', payload.model);
  form.append('prompt', payload.prompt);
  if (payload.size) form.append('size', payload.size);
  if (payload.quality) form.append('quality', payload.quality);
  if (payload.output_format) form.append('output_format', payload.output_format);
  if (payload.n) form.append('n', String(payload.n));

  for (let index = 0; index < payload.image.length; index += 1) {
    const blob = await imageSourceToBlob(payload.image[index]);
    if (blob) form.append('image', blob, `image_${index}.png`);
  }
  if (payload.mask) {
    const maskBlob = await imageSourceToBlob(payload.mask);
    if (maskBlob) form.append('mask', maskBlob, 'mask.png');
  }

  const requestHeaders = { ...headers };
  delete requestHeaders['Content-Type'];
  logOutgoingRequest(sendProgress, {
    type: 'form-data',
    url,
    method: 'POST',
    body: summarizeFormData(form),
  });

  let response;
  try {
    response = await fetchWithImageTimeout(
      url,
      {
        method: 'POST',
        headers: requestHeaders,
        body: form,
      },
      timeoutMs,
      externalSignal,
      sendProgress,
    );
  } catch (error) {
    throw new Error(`图像编辑请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像编辑 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像编辑', sendProgress);
}

export async function generateImages(request, runtimeConfig, sendProgress) {
  const { apiKey, baseUrl, providerConfig } = runtimeConfig;
  const abortSignal = runtimeConfig.abortSignal;
  const adapter = getProviderAdapter(providerConfig);
  if (!apiKey) {
    throw new Error('Missing API key for image generation');
  }

  const normalized = normalizeImageGenerationRequest(request);
  normalized.model = resolveImageGenerationModel(normalized, runtimeConfig);
  const timeoutMs = getImageTimeoutMs(providerConfig);

  const referenceImages = [];
  for (const image of normalized.image) {
    referenceImages.push(await fileToBase64(image));
  }
  const mask = normalized.mask ? await fileToBase64(normalized.mask) : '';

  const payload = normalizeProviderImageSizing({
    ...normalized,
    image: referenceImages,
    mask,
  }, runtimeConfig);

  const requestCount = payload.n || 1;

  const sizeSummary = payload.size
    ? `${payload.size}${payload.sizeSource === 'dimensions' ? ' (宽高优先)' : ''}`
    : payload.aspect_ratio
      ? `${payload.aspect_ratio} (比例映射)`
      : 'auto';
  sendProgress?.(`开始生成图片: model=${payload.model}; size=${sizeSummary}; n=${requestCount}`);

  const rawImages = [];
  const rawData = [];

  for (let index = 0; index < requestCount; index += 1) {
    sendProgress?.(`正在生成第 ${index + 1}/${requestCount} 张图片...`);

    const { endpoint: imageEndpoint } = resolveModelRuntime(runtimeConfig, payload.model, {
      expectedType: 'image',
      purpose: 'image',
    });
    const usesGeminiGenerateContent = isGeminiGenerateContentEndpoint(imageEndpoint);
    const usesChatPayload = isChatCompletionsEndpoint(imageEndpoint);
    const usesArkImageGenerationPayload = isVolcengineArkRuntime(baseUrl) && !usesChatPayload && !usesGeminiGenerateContent;
    const shouldUseEditEndpoint = (payload.image.length > 0 || payload.mask)
      && !usesArkImageGenerationPayload
      && !usesChatPayload
      && !usesGeminiGenerateContent;

    const attemptData = shouldUseEditEndpoint
      ? await (() => {
          const { endpoint } = resolveModelRuntime(runtimeConfig, payload.model, {
            expectedType: 'image',
            purpose: 'image-edit',
          });
          const requestBody = {
            ...payload,
            n: 1,
          };
          const form = new FormData();
          form.append('model', requestBody.model);
          form.append('prompt', requestBody.prompt);
          if (requestBody.size) form.append('size', requestBody.size);
          if (requestBody.quality) form.append('quality', requestBody.quality);
          if (requestBody.output_format) form.append('output_format', requestBody.output_format);
          if (requestBody.n) form.append('n', String(requestBody.n));
          const formSummary = [
            { key: 'model', value: requestBody.model },
            { key: 'prompt', value: requestBody.prompt },
            ...(requestBody.size ? [{ key: 'size', value: requestBody.size }] : []),
            ...(requestBody.quality ? [{ key: 'quality', value: requestBody.quality }] : []),
            ...(requestBody.output_format ? [{ key: 'output_format', value: requestBody.output_format }] : []),
            { key: 'n', value: String(requestBody.n) },
            ...requestBody.image.map((item, imageIndex) => ({ key: 'image', index: imageIndex, preview: String(item).slice(0, 120) })),
            ...(requestBody.mask ? [{ key: 'mask', preview: String(requestBody.mask).slice(0, 120) }] : []),
          ];
          return (async () => {
            for (let imageIndex = 0; imageIndex < requestBody.image.length; imageIndex += 1) {
              const blob = await imageSourceToBlob(requestBody.image[imageIndex]);
              if (blob) form.append('image', blob, `image_${imageIndex}.png`);
            }
            if (requestBody.mask) {
              const maskBlob = await imageSourceToBlob(requestBody.mask);
              if (maskBlob) form.append('mask', maskBlob, 'mask.png');
            }
            const requestConfig = adapter.buildRawRequest({
              apiKey,
              providerConfig,
              baseUrl,
              endpoint,
              method: 'POST',
              headers: { 'Content-Type': undefined },
              body: form,
            });
            delete requestConfig.options.headers['Content-Type'];
            return callImageEditApiWithAdapter(
              adapter,
              requestConfig,
              requestBody,
              timeoutMs,
              sendProgress,
              abortSignal,
            );
          })();
        })()
      : await (async () => {
          const endpoint = imageEndpoint;

          if (usesGeminiGenerateContent) {
            const requestBody = {
              contents: [
                {
                  parts: buildGeminiImageParts(payload.prompt, payload.image, payload),
                },
              ],
            };
            return callGeminiGenerateContentApi(
              adapter,
              baseUrl,
              endpoint,
              apiKey,
              requestBody,
              timeoutMs,
              sendProgress,
              abortSignal,
            );
          }

          if (usesChatPayload) {
            const buildRequestBody = (includeResponseFormat = true, includeOutputFormat = true) => ({
              model: payload.model,
              stream: false,
              ...(includeResponseFormat ? { response_format: CHAT_URL_RESPONSE_FORMAT } : {}),
              ...(payload.size ? { size: payload.size } : {}),
              ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
              ...(payload.quality ? { quality: payload.quality } : {}),
              ...(includeOutputFormat && payload.output_format ? { output_format: payload.output_format } : {}),
              n: 1,
              messages: [
                {
                  role: 'user',
                  content: buildChatImageContent(payload.prompt, payload.image, payload),
                },
              ],
            });
            const callWithRequestBody = (requestBody) => {
              const requestConfig = adapter.buildJsonRequest({
                apiKey,
                providerConfig,
                baseUrl,
                endpoint,
                method: 'POST',
                body: requestBody,
              });
              return callImageGenerationViaChatApiWithAdapter(
                adapter,
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
              return await callWithRequestBody(buildRequestBody(true, true));
            } catch (error) {
              if (shouldRetryWithoutOutputFormat(error)) {
                sendProgress?.('上游不支持 output_format，已忽略输出格式重试一次');
                return callWithRequestBody(buildRequestBody(true, false));
              }
              if (!shouldRetryWithoutResponseFormat(error)) {
                throw error;
              }
              sendProgress?.('上游不支持 response_format=url，已降级为默认返回格式重试一次');
              return callWithRequestBody(buildRequestBody(false, true));
            }
          }

          const buildRequestBody = (includeResponseFormat = true, includeOutputFormat = true) => ({
            model: payload.model,
            prompt: payload.prompt,
            ...(includeResponseFormat ? { response_format: URL_RESPONSE_FORMAT } : {}),
            ...(payload.size ? { size: payload.size } : {}),
            ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
            ...(payload.quality ? { quality: payload.quality } : {}),
            ...(includeOutputFormat && payload.output_format ? { output_format: payload.output_format } : {}),
            ...(usesArkImageGenerationPayload && payload.image.length > 0 ? { image: payload.image } : {}),
            n: 1,
          });
          const callWithRequestBody = (requestBody) => {
            const requestConfig = adapter.buildJsonRequest({
              apiKey,
              providerConfig,
              baseUrl,
              endpoint,
              method: 'POST',
              body: requestBody,
            });
            return callImageGenerationApiWithAdapter(
              adapter,
              requestConfig,
              requestBody,
              timeoutMs,
              sendProgress,
              abortSignal,
            );
          };

          try {
            return await callWithRequestBody(buildRequestBody(true, true));
          } catch (error) {
            if (shouldRetryWithoutOutputFormat(error)) {
              sendProgress?.('上游不支持 output_format，已忽略输出格式重试一次');
              return callWithRequestBody(buildRequestBody(true, false));
            }
            if (!shouldRetryWithoutResponseFormat(error)) {
              throw error;
            }
            sendProgress?.('上游不支持 response_format=url，已降级为默认返回格式重试一次');
            return callWithRequestBody(buildRequestBody(false, true));
          }
        })();

    rawData.push(attemptData);
    rawImages.push(...extractImagesFromResponse(attemptData));
  }

  if (rawImages.length === 0) {
    throw new Error('Image API did not return any images');
  }

  const shouldPersistGeneratedOutputs = runtimeConfig.persistGeneratedOutputs !== false;
  const outputImages = [];
  for (let index = 0; index < rawImages.length; index += 1) {
    const image = rawImages[index];
    const imageStr = String(image);
    if (imageStr.startsWith('data:')) {
      try {
        const match = imageStr.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          if (!shouldPersistGeneratedOutputs) {
            outputImages.push(imageStr);
            continue;
          }
          const ext = (match[1] || 'image/png').split('/').pop() || 'png';
          const fileName = `images/${randomUUID()}.${ext}`;
          const filePath = path.join(STORAGE_PATHS.generatedDir, fileName);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
          outputImages.push(`/api/outputs/${fileName}`);
        }
      } catch {
        outputImages.push(imageStr);
      }
    } else if (imageStr.startsWith('http://') || imageStr.startsWith('https://')) {
      try {
        const downloaded = await downloadRemoteImage(image, sendProgress, abortSignal);
        try {
          const match = downloaded.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            if (!shouldPersistGeneratedOutputs) {
              outputImages.push(downloaded);
              continue;
            }
            const ext = (match[1] || 'image/png').split('/').pop() || 'png';
            const fileName = `images/${randomUUID()}.${ext}`;
            const filePath = path.join(STORAGE_PATHS.generatedDir, fileName);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
            outputImages.push(`/api/outputs/${fileName}`);
          }
        } catch {
          outputImages.push(downloaded);
        }
      } catch (error) {
        sendProgress?.(`下载远程图片失败，已保留原始URL继续流程: ${String(image)}; ${error?.message || error}`);
        outputImages.push(String(image));
      }
    } else {
      throw new Error(`无法识别的图片返回格式: ${String(image).slice(0, 120)}`);
    }
  }

  return {
    images: outputImages,
    rawImages,
    request: payload,
    rawData,
  };
}

export { SIZE_BY_RATIO, getSizeFromRatio };
