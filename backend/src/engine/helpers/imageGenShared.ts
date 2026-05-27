import { proxyAwareFetch } from '../../platform/http/proxy-aware-fetch.js';

// biome-ignore lint/suspicious/noExplicitAny: Provider payloads and upstream JSON are intentionally dynamic at this boundary.
export type DynamicValue = any;
export type LooseRecord = Record<string, DynamicValue>;
export type ProgressCallback = ((message: string) => void) | undefined;

export const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
export const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;charset=[^;,]+)?;base64,/i;
const DATA_URL_LOG_PREVIEW_LENGTH = 48;
const IMAGE_REQUEST_RETRY_DELAYS_MS = [1_000, 2_000];

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
