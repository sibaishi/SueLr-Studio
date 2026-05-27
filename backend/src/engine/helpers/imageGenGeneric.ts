import {
  type DynamicValue,
  type LooseRecord,
  type ProgressCallback,
  describeFetchError,
  fetchWithImageTimeout,
  logOutgoingRequest,
  parseApiError,
  parseImageApiResponse,
} from './imageGenShared.js';

const URL_RESPONSE_FORMAT = 'url';
const CHAT_URL_RESPONSE_FORMAT = { type: 'url' };

function cleanText(value: DynamicValue): string {
  return String(value || '').trim();
}

function buildChatImagePromptText(prompt: DynamicValue, payload: LooseRecord): string {
  const lines: string[] = [];

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

  if (payload.resolution) {
    lines.push(`输出档位：${payload.resolution}`);
  }

  if (payload.output_format) {
    lines.push(`输出格式：${payload.output_format}`);
  }

  return lines.join('\n');
}

function buildChatImageContent(prompt: DynamicValue, images: DynamicValue, payload: LooseRecord = {}) {
  const parts: DynamicValue[] = [];
  const promptText = buildChatImagePromptText(prompt, payload);
  if (promptText) parts.push({ type: 'text', text: promptText });
  for (const image of images || []) {
    if (!image) continue;
    parts.push({ type: 'image_url', image_url: { url: image } });
  }
  return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;
}

export async function callImageGenerationApiWithAdapter(
  request: LooseRecord,
  payload: LooseRecord,
  timeoutMs: number,
  sendProgress: ProgressCallback,
  externalSignal: AbortSignal | undefined,
) {
  sendProgress?.(`正在调用图像生成接口: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url: request.url,
    method: 'POST',
    body: payload,
  });

  let response: Response;
  try {
    response = await fetchWithImageTimeout(request.url, request.options, timeoutMs, externalSignal, sendProgress);
  } catch (error) {
    throw new Error(`图像生成请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMessage}`);
  }

  return parseImageApiResponse(response, '图像生成', sendProgress);
}

export async function callImageGenerationViaChatApiWithAdapter(
  request: LooseRecord,
  payload: LooseRecord,
  timeoutMs: number,
  sendProgress: ProgressCallback,
  externalSignal: AbortSignal | undefined,
) {
  sendProgress?.(`正在通过对话接口生成图片: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'json',
    url: request.url,
    method: 'POST',
    body: JSON.parse(request.options.body),
  });

  let response: Response;
  try {
    response = await fetchWithImageTimeout(request.url, request.options, timeoutMs, externalSignal, sendProgress);
  } catch (error) {
    throw new Error(`对话生图请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`对话生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '对话生图', sendProgress);
}

export function buildGenericImageRequestBody(
  payload: LooseRecord,
  usesArkImageGenerationPayload: boolean,
  includeResponseFormat = true,
  includeOutputFormat = true,
  options: LooseRecord = {},
) {
  return {
    model: options.model || payload.model,
    prompt: payload.prompt,
    ...(includeResponseFormat ? { response_format: URL_RESPONSE_FORMAT } : {}),
    ...(payload.size ? { size: payload.size } : {}),
    ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    ...(options.includeResolution && payload.resolution ? { resolution: payload.resolution } : {}),
    ...(includeOutputFormat && payload.output_format ? { output_format: payload.output_format } : {}),
    ...(usesArkImageGenerationPayload && payload.image.length > 0 ? { image: payload.image } : {}),
    n: 1,
  };
}

export function buildChatImageRequestBody(
  payload: LooseRecord,
  includeResponseFormat = true,
  includeOutputFormat = true,
  options: LooseRecord = {},
) {
  return {
    model: options.model || payload.model,
    stream: false,
    ...(includeResponseFormat ? { response_format: CHAT_URL_RESPONSE_FORMAT } : {}),
    ...(payload.size ? { size: payload.size } : {}),
    ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    ...(options.includeResolution && payload.resolution ? { resolution: payload.resolution } : {}),
    ...(includeOutputFormat && payload.output_format ? { output_format: payload.output_format } : {}),
    n: 1,
    messages: [
      {
        role: 'user',
        content: buildChatImageContent(payload.prompt, payload.image, payload),
      },
    ],
  };
}
