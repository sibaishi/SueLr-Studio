import { proxyAwareFetch } from '../../platform/http/proxy-aware-fetch.ts';

// biome-ignore lint/suspicious/noExplicitAny: Provider payloads and upstream JSON are intentionally dynamic at this boundary.
export type DynamicValue = any;
export type LooseRecord = Record<string, DynamicValue>;
export type ProgressCallback = ((message: string) => void) | undefined;

export const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
export const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;charset=[^;,]+)?;base64,/i;
const DATA_URL_LOG_PREVIEW_LENGTH = 48;
const IMAGE_REQUEST_RETRY_DELAYS_MS = [1_000, 2_000];
const BASE64_IMAGE_MIME_BY_MAGIC = [
  { mimeType: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { mimeType: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { mimeType: 'image/webp', magic: Buffer.from('RIFF') },
];

type ImageResponseReadResult = {
  bytesRead: number;
  error?: DynamicValue;
  text: string;
};

export function cleanText(value: DynamicValue): string {
  return String(value || '').trim();
}

export function describeFetchError(error: DynamicValue): string {
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

function summarizeInlineDataUrl(value: DynamicValue): DynamicValue {
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

function sanitizeRequestDetailsForLog(value: DynamicValue): DynamicValue {
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

export function summarizeFormData(form: FormData): LooseRecord[] {
  const summary: LooseRecord[] = [];
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

export function logOutgoingRequest(sendProgress: ProgressCallback, details: LooseRecord): void {
  sendProgress?.(`[ImageRequest] ${stringifyForLog(sanitizeRequestDetailsForLog(details))}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFetchErrorCode(error: DynamicValue): string {
  return error?.cause?.code || error?.code || '';
}

function isRetryableImageRequestError(error: DynamicValue): boolean {
  const code = getFetchErrorCode(error);
  return code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ECONNRESET';
}

async function readImageResponseText(response: Response): Promise<ImageResponseReadResult> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return { text, bytesRead: Buffer.byteLength(text) };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  while (true) {
    try {
      const { done, value } = await reader.read();
      if (done) {
        chunks.push(decoder.decode());
        return { text: chunks.join(''), bytesRead };
      }
      if (value) {
        bytesRead += value.byteLength;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      chunks.push(decoder.decode());
      return { text: chunks.join(''), bytesRead, error };
    }
  }
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function normalizeBase64(value: DynamicValue): string {
  return cleanText(value).replace(/\s+/g, '');
}

function detectImageMimeFromBase64(value: string): string {
  const normalized = normalizeBase64(value);
  if (!normalized || normalized.length < 16 || normalized.length % 4 === 1) return '';
  let buffer: Buffer;
  try {
    buffer = Buffer.from(normalized, 'base64');
  } catch {
    return '';
  }
  if (buffer.byteLength < 8) return '';
  const riffWebp =
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
  if (riffWebp) return 'image/webp';
  const match = BASE64_IMAGE_MIME_BY_MAGIC.find((item) => buffer.subarray(0, item.magic.length).equals(item.magic));
  return match?.mimeType || '';
}

function toVerifiedDataUrl(base64: DynamicValue, fallbackMimeType = 'image/png'): string {
  const normalized = normalizeBase64(base64);
  const detectedMimeType = detectImageMimeFromBase64(normalized);
  if (!detectedMimeType) return '';
  const mimeType = cleanText(fallbackMimeType).startsWith('image/') ? fallbackMimeType : detectedMimeType;
  return `data:${mimeType};base64,${normalized}`;
}

function addUniqueImage(images: string[], image: DynamicValue): void {
  const value = cleanText(image);
  if (value && !images.includes(value)) images.push(value);
}

function recoverImagesFromPartialText(text: string): string[] {
  const images: string[] = [];
  const addVerifiedBase64 = (base64: string, mimeType = 'image/png') => {
    addUniqueImage(images, toVerifiedDataUrl(unescapeJsonString(base64), mimeType));
  };

  for (const match of text.matchAll(/"(?:url|image_url|imageUrl|output_url|outputUrl)"\s*:\s*"(https?:\/\/(?:\\.|[^"\\])+)"/g)) {
    addUniqueImage(images, unescapeJsonString(match[1]));
  }

  for (const match of text.matchAll(/"(?:b64_json|base64|image_base64|imageBase64)"\s*:\s*"([A-Za-z0-9+/=\\r\\n\\t ]+)"/g)) {
    addVerifiedBase64(match[1]);
  }

  for (const match of text.matchAll(/"inlineData"\s*:\s*\{[^{}]{0,8000}?"mimeType"\s*:\s*"([^"]+)"[^{}]{0,8000}?"data"\s*:\s*"([A-Za-z0-9+/=\\r\\n\\t ]+)"/g)) {
    addVerifiedBase64(match[2], unescapeJsonString(match[1]));
  }

  for (const match of text.matchAll(/"inline_data"\s*:\s*\{[^{}]{0,8000}?"mime_type"\s*:\s*"([^"]+)"[^{}]{0,8000}?"data"\s*:\s*"([A-Za-z0-9+/=\\r\\n\\t ]+)"/g)) {
    addVerifiedBase64(match[2], unescapeJsonString(match[1]));
  }

  for (const match of text.matchAll(/(data:image\/[\w.+-]+(?:;charset=[^;,]+)?;base64,[A-Za-z0-9+/=\s]+)/g)) {
    const dataUrl = cleanText(match[1]).replace(/\s+/g, '');
    const base64 = dataUrl.replace(DATA_URL_PREFIX, '');
    if (detectImageMimeFromBase64(base64)) addUniqueImage(images, dataUrl);
  }

  return images;
}

function hasPotentialIncompleteBase64(text: string): boolean {
  return /"(?:data|b64_json|base64|image_base64|imageBase64)"\s*:\s*"[A-Za-z0-9+/=\s]*$/i.test(text);
}

function buildRecoveredImageResponse(images: string[]): LooseRecord {
  return {
    recoveredFromPartialResponse: true,
    outputs: images,
  };
}

export async function fetchWithImageTimeout(
  url: string,
  options: LooseRecord,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  sendProgress: ProgressCallback,
): Promise<Response> {
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let lastError: DynamicValue;
  const attempts = IMAGE_REQUEST_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await proxyAwareFetch(url, {
        ...options,
        signal,
      });
    } catch (error) {
      lastError = error;
      const shouldRetry =
        !signal.aborted && isRetryableImageRequestError(error) && attempt < IMAGE_REQUEST_RETRY_DELAYS_MS.length;
      if (!shouldRetry) {
        throw error;
      }

      const retryDelayMs = IMAGE_REQUEST_RETRY_DELAYS_MS[attempt];
      sendProgress?.(
        `图像请求连接异常，${retryDelayMs}ms 后重试第 ${attempt + 2}/${attempts} 次: ${describeFetchError(error)}`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

export async function parseApiError(response: Response): Promise<string> {
  const errorText = await response.text().catch(() => '未知错误');
  try {
    const payload = JSON.parse(errorText);
    return String(payload.error?.message || payload.message || '上游服务返回错误')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  } catch {
    return String(errorText || '上游服务返回错误')
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  }
}

export function extractImagesFromResponse(data: DynamicValue): string[] {
  const images: string[] = [];
  const payload = data?.data && !Array.isArray(data.data) ? data.data : data;
  const pushImage = (value: DynamicValue, mimeType = 'image/png', allowBareBase64 = false) => {
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
  const collectNestedImages = (value: DynamicValue, key = ''): void => {
    if (value === undefined || value === null) return;
    const normalizedKey = cleanText(key).toLowerCase();
    const isImageKey =
      /^(url|image|images|image_url|imageurl|output|outputs|output_url|outputurl|artifact|artifacts)$/.test(
        normalizedKey,
      );
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
    let match = markdownImageRegex.exec(content);
    while (match !== null) {
      pushImage(match[1]);
      match = markdownImageRegex.exec(content);
    }

    const base64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
    match = base64Regex.exec(content);
    while (match !== null) {
      if (!images.includes(match[1])) {
        pushImage(match[1]);
      }
      match = base64Regex.exec(content);
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

export async function parseImageApiResponse(
  response: Response,
  context: string,
  sendProgress: ProgressCallback,
): Promise<DynamicValue> {
  const contentType = response.headers.get('content-type') || 'unknown';
  const contentLength = response.headers.get('content-length') || 'unknown';
  const readStart = Date.now();
  let responseText = '';

  sendProgress?.(
    `${context}响应头已收到: status=${response.status}; contentType=${contentType}; contentLength=${contentLength}`,
  );

  let readResult: ImageResponseReadResult;
  try {
    readResult = await readImageResponseText(response);
    responseText = readResult.text;
  } catch (error) {
    sendProgress?.(`${context}响应体读取失败: elapsedMs=${Date.now() - readStart}; ${describeFetchError(error)}`);
    throw new Error(`${context}响应读取失败: contentType=${contentType}; ${describeFetchError(error)}`);
  }

  if (readResult.error) {
    const recoveredImages = recoverImagesFromPartialText(responseText);
    sendProgress?.(
      `${context}响应体读取失败: elapsedMs=${Date.now() - readStart}; bytesRead=${readResult.bytesRead}; recoveredImages=${recoveredImages.length}; ${describeFetchError(readResult.error)}`,
    );
    if (recoveredImages.length > 0) {
      sendProgress?.(`${context}已从中断响应中恢复 ${recoveredImages.length} 个完整图片结果`);
      return buildRecoveredImageResponse(recoveredImages);
    }
    const incompleteHint = hasPotentialIncompleteBase64(responseText) ? '; incomplete base64 image data' : '';
    throw new Error(
      `${context}响应读取失败: contentType=${contentType}; bytesRead=${readResult.bytesRead}${incompleteHint}; ${describeFetchError(readResult.error)}`,
    );
  }

  sendProgress?.(
    `${context}响应体读取完成: bytes=${readResult.bytesRead}; chars=${responseText.length}; elapsedMs=${Date.now() - readStart}`,
  );

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
