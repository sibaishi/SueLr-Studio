import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileToBase64 } from './fileHelper.js';
import { resolveModelRuntime } from './apiConfig.js';
import { getProviderAdapter } from '../../src/platform/providers/index.js';
import { assertSafeRemoteDownloadUrl } from '../../src/platform/security/network-guards.js';

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

const ALLOWED_QUALITY = new Set(['low', 'medium', 'high', 'auto']);
const ALLOWED_FORMAT = new Set(['png', 'jpeg', 'webp']);
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_IMAGE_ENDPOINT = '/v1/images/generations';

function cleanText(value) {
  return String(value || '').trim();
}

function roundToNearest16(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(16, Math.round(numeric / 16) * 16);
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

  return {
    size: getSizeFromRatio(ratio),
    aspect_ratio: aspectRatio,
    sizeSource: aspectRatio ? 'ratio' : 'auto',
  };
}

export function normalizeImageGenerationRequest(request = {}) {
  const prompt = normalizeTextInput(request.prompt);
  const model = cleanText(request.model);
  const ratio = cleanText(request.ratio || 'auto') || 'auto';
  const roundedWidth = roundToNearest16(request.width);
  const roundedHeight = roundToNearest16(request.height);
  const sizing = getSizing({ ratio, roundedWidth, roundedHeight });
  const size = sizing.size;
  const quality = cleanText(request.quality);
  const outputFormat = cleanText(request.output_format || request.outputFormat);
  const n = request.n === undefined || request.n === null || request.n === '' ? 1 : parseInteger(request.n);

  if (!model) throw new Error('缺少图像模型 model');
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
  sendProgress?.(`[ImageRequest] ${stringifyForLog(details)}`);
}

async function fetchWithImageTimeout(url, options, timeoutMs, externalSignal) {
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...options,
    signal,
  });
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

  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item?.url) images.push(item.url);
      if (item?.b64_json) images.push(`data:image/png;base64,${item.b64_json}`);
    }
  }

  if (Array.isArray(payload?.outputs)) {
    for (const output of payload.outputs) {
      if (typeof output === 'string') images.push(output);
      if (output?.url) images.push(output.url);
      if (output?.b64_json) images.push(`data:image/png;base64,${output.b64_json}`);
    }
  }

  if (Array.isArray(data?.candidates)) {
    for (const candidate of data.candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        const mimeType = cleanText(part?.inlineData?.mimeType);
        const base64 = cleanText(part?.inlineData?.data);
        if (mimeType.startsWith('image/') && base64) {
          images.push(`data:${mimeType};base64,${base64}`);
        }
      }
    }
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    const markdownImageRegex = /!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(content)) !== null) {
      images.push(match[1]);
    }

    const base64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
    while ((match = base64Regex.exec(content)) !== null) {
      if (!images.includes(match[1])) {
        images.push(match[1]);
      }
    }
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part?.image_url?.url) {
        images.push(part.image_url.url);
      }
    }
  }

  return images;
}

async function parseImageApiResponse(response, context) {
  const contentType = response.headers.get('content-type') || 'unknown';
  let responseText = '';

  try {
    responseText = await response.text();
  } catch (error) {
    throw new Error(`${context}响应读取失败: contentType=${contentType}; ${describeFetchError(error)}`);
  }

  if (!responseText.trim()) {
    throw new Error(`${context}响应为空: contentType=${contentType}`);
  }

  try {
    return JSON.parse(responseText);
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
    );
  } catch (error) {
    throw new Error(`图像生成请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像生成');
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
    );
  } catch (error) {
    throw new Error(`图像生成请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像生成 API 调用失败 (${response.status}): ${errorMessage}`);
  }

  return parseImageApiResponse(response, '图像生成');
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
    );
  } catch (error) {
    throw new Error(`对话生图请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`对话生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '对话生图');
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
    );
  } catch (error) {
    throw new Error(`图像编辑请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像编辑 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像编辑');
}

async function callImageGenerationViaChatApi(url, headers, payload, timeoutMs, sendProgress, externalSignal) {
  sendProgress?.(`正在通过对话接口生成图片: ${url}`);
  const body = {
    model: payload.model,
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
    );
  } catch (error) {
    throw new Error(`对话生图请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`对话生图 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '对话生图');
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
    );
  } catch (error) {
    throw new Error(`图像编辑请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像编辑 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像编辑');
}

export async function generateImages(request, runtimeConfig, sendProgress) {
  const { apiKey, baseUrl, providerConfig } = runtimeConfig;
  const abortSignal = runtimeConfig.abortSignal;
  const adapter = getProviderAdapter(providerConfig);
  if (!apiKey) {
    throw new Error('Missing API key for image generation');
  }

  const normalized = normalizeImageGenerationRequest(request);
  const timeoutMs = getImageTimeoutMs(providerConfig);

  const referenceImages = [];
  for (const image of normalized.image) {
    referenceImages.push(await fileToBase64(image));
  }
  const mask = normalized.mask ? await fileToBase64(normalized.mask) : '';

  const payload = {
    ...normalized,
    image: referenceImages,
    mask,
  };

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

    const attemptData = payload.image.length > 0 || payload.mask
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
            logOutgoingRequest(sendProgress, {
              type: 'form-data',
              url: requestConfig.url,
              method: 'POST',
              body: formSummary,
            });
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
      : await (() => {
          const { endpoint } = resolveModelRuntime(runtimeConfig, payload.model, {
            expectedType: 'image',
            purpose: 'image',
          });
          const normalizedEndpoint = String(endpoint || '').toLowerCase();
          const usesChatPayload = normalizedEndpoint.includes('/chat/completions');

          if (usesChatPayload) {
            const requestBody = {
              model: payload.model,
              ...(payload.size ? { size: payload.size } : {}),
              ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
              ...(payload.quality ? { quality: payload.quality } : {}),
              ...(payload.output_format ? { output_format: payload.output_format } : {}),
              n: 1,
              messages: [
                {
                  role: 'user',
                  content: buildChatImageContent(payload.prompt, payload.image, payload),
                },
              ],
            };
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
              },
              timeoutMs,
              sendProgress,
              abortSignal,
            );
          }

          const requestBody = {
            model: payload.model,
            prompt: payload.prompt,
            ...(payload.size ? { size: payload.size } : {}),
            ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
            ...(payload.quality ? { quality: payload.quality } : {}),
            ...(payload.output_format ? { output_format: payload.output_format } : {}),
            n: 1,
          };
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
        })();

    rawData.push(attemptData);
    rawImages.push(...extractImagesFromResponse(attemptData));
  }

  if (rawImages.length === 0) {
    throw new Error('Image API did not return any images');
  }

  const outputImages = [];
  for (let index = 0; index < rawImages.length; index += 1) {
    const image = rawImages[index];
    if (String(image).startsWith('data:')) {
      outputImages.push(image);
    } else if (String(image).startsWith('http')) {
      outputImages.push(await downloadRemoteImage(image, sendProgress, abortSignal));
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
