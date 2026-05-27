import {
  type DynamicValue,
  type LooseRecord,
  type ProgressCallback,
  cleanText,
  describeFetchError,
  fetchWithImageTimeout,
  logOutgoingRequest,
  parseApiError,
  parseImageApiResponse,
} from './imageGenShared.js';

const GEMINI_IMAGE_SIZE_BY_RESOLUTION = {
  '1k': '1K',
  '2k': '2K',
  '4k': '4K',
};

function buildGeminiImagePromptText(prompt: DynamicValue, payload: LooseRecord = {}): string {
  const lines: string[] = [];
  if (cleanText(prompt)) {
    lines.push('Generate an image from this prompt:');
    lines.push(cleanText(prompt));
  }
  if (payload.size) lines.push(`Size: ${payload.size}`);
  if (payload.aspect_ratio) lines.push(`Aspect ratio: ${payload.aspect_ratio}`);
  if (payload.quality) lines.push(`Quality: ${payload.quality}`);
  if (payload.resolution) lines.push(`Resolution tier: ${payload.resolution}`);
  if (payload.output_format) lines.push(`Output format: ${payload.output_format}`);
  return lines.join('\n');
}

function dataUrlToGeminiInlineData(dataUrl: DynamicValue): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    data: match[2],
  };
}

export function buildGeminiImageParts(prompt: DynamicValue, images: DynamicValue, payload: LooseRecord = {}) {
  const parts: DynamicValue[] = [];
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

export function buildGeminiImageGenerationConfig(payload: LooseRecord = {}, supportedRatios: Set<string>) {
  const imageConfig: LooseRecord = {};
  const aspectRatio = payload.ratio && payload.ratio !== 'auto' ? payload.ratio : payload.aspect_ratio;
  const imageSize = GEMINI_IMAGE_SIZE_BY_RESOLUTION[payload.resolution as keyof typeof GEMINI_IMAGE_SIZE_BY_RESOLUTION];

  if (aspectRatio && supportedRatios.has(aspectRatio)) {
    imageConfig.aspectRatio = aspectRatio;
  }
  if (imageSize) {
    imageConfig.imageSize = imageSize;
  }

  return Object.keys(imageConfig).length > 0 ? { imageConfig } : undefined;
}

function buildGeminiGenerateContentUrl(
  adapter: LooseRecord,
  baseUrl: DynamicValue,
  endpoint: DynamicValue,
  apiKey: DynamicValue,
): string {
  const rawUrl = adapter.buildEndpoint(baseUrl, endpoint);
  const key = String(apiKey || '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
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

export async function callGeminiGenerateContentApi(
  adapter: LooseRecord,
  baseUrl: DynamicValue,
  endpoint: DynamicValue,
  apiKey: DynamicValue,
  payload: LooseRecord,
  timeoutMs: number,
  sendProgress: ProgressCallback,
  externalSignal: AbortSignal | undefined,
) {
  const url = buildGeminiGenerateContentUrl(adapter, baseUrl, endpoint, apiKey);
  const safeUrl = url.replace(/([?&]key=)[^&]+/i, '$1***');
  sendProgress?.(`正在通过 Gemini generateContent 接口生成图片: ${safeUrl}`);
  logOutgoingRequest(sendProgress, {
    type: 'gemini-generate-content',
    url: safeUrl,
    method: 'POST',
    body: payload,
  });

  let response: Response;
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
