import { fileToBase64 } from '../../engine/helpers/fileHelper.js';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.js';
import { getProviderAdapter } from '../providers/index.js';
import { ProviderError } from '../../app/errors/index.js';
import { assertSafeRemoteDownloadUrl } from '../security/network-guards.js';

const REMOTE_VIDEO_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const ARK_VIDEO_TASKS_ENDPOINT = '/contents/generations/tasks';

function normalizeTextInput(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').join('\n');
  }
  return String(value || '').trim();
}

function normalizeMediaArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '');
  }
  return [value];
}

function normalizeDuration(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const duration = Number(value);
  if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
    throw new Error('视频时长 duration 必须为 -1 或 4 到 15 的整数秒');
  }
  if (duration === -1) return duration;
  if (duration < 4 || duration > 15) {
    throw new Error('视频时长 duration 必须为 -1 或 4 到 15 的整数秒');
  }
  return duration;
}

function toInputAudioPart(base64) {
  const mimeMatch = String(base64).match(/^data:(audio\/[^;]+);/);
  const format = mimeMatch ? mimeMatch[1].split('/')[1] : 'mp3';
  return { type: 'input_audio', input_audio: { data: String(base64).split(',')[1], format } };
}

function isVolcengineArkRuntime(baseUrl) {
  return String(baseUrl || '').toLowerCase().includes('ark.cn-beijing.volces.com/api/v3');
}

function isArkVideoTasksEndpoint(endpoint) {
  return String(endpoint || '').toLowerCase().includes('/contents/generations/tasks');
}

function resolveVideoTasksEndpoint(baseUrl, providerConfig, endpoint) {
  if (isArkVideoTasksEndpoint(endpoint)) return endpoint;
  if (isVolcengineArkRuntime(baseUrl)) return ARK_VIDEO_TASKS_ENDPOINT;
  return endpoint || providerConfig?.videoEndpoint || '/v1/video/generations';
}

function firstStringByKeys(value, keys) {
  if (!value || typeof value !== 'object') return '';
  const keySet = new Set(keys);
  const queue = [value];
  const seen = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    for (const [key, nested] of Object.entries(item)) {
      if (keySet.has(key) && typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return '';
}

function extractVideoTaskId(data) {
  return data?.id || data?.task_id || data?.data?.id || data?.data?.task_id || firstStringByKeys(data, ['id', 'task_id']);
}

function extractVideoUrl(data) {
  return data?.video_url
    || data?.output?.video_url
    || data?.data?.video_url
    || data?.data?.output?.video_url
    || firstStringByKeys(data, ['video_url', 'url']);
}

function shouldUseReferenceImageRole(model, imageCount) {
  const normalized = String(model || '').toLowerCase();
  return imageCount > 1 || normalized.includes('seedance-2-');
}

function buildArkVideoContent({ model, prompt, image_url, image_urls, video_url, video_urls, input_audio, input_audios, messages }) {
  if (Array.isArray(messages) && messages.length > 0) {
    const content = messages.flatMap((message) => {
      if (Array.isArray(message?.content)) return message.content;
      if (typeof message?.content === 'string' && message.content.trim()) {
        return [{ type: 'text', text: message.content.trim() }];
      }
      return [];
    });
    if (content.length > 0) return content;
  }

  const content = [];
  const text = normalizeTextInput(prompt);
  if (text) content.push({ type: 'text', text });

  const images = normalizeMediaArray(image_urls?.length ? image_urls : image_url);
  const imageRole = shouldUseReferenceImageRole(model, images.length) ? 'reference_image' : '';
  for (const image of images) {
    content.push({
      type: 'image_url',
      image_url: { url: image },
      ...(imageRole ? { role: imageRole } : {}),
    });
  }
  for (const video of normalizeMediaArray(video_urls?.length ? video_urls : video_url)) {
    content.push({ type: 'video_url', video_url: { url: video }, role: 'reference_video' });
  }
  for (const audio of normalizeMediaArray(input_audios?.length ? input_audios : input_audio)) {
    if (audio?.data && audio?.format) {
      content.push({
        type: 'audio_url',
        audio_url: { url: `data:audio/${audio.format};base64,${audio.data}` },
        role: 'reference_audio',
      });
    } else {
      content.push({ type: 'audio_url', audio_url: { url: audio }, role: 'reference_audio' });
    }
  }

  return content;
}

async function buildVideoGenerationPayload(prompt, inputs, sendProgress) {
  const parts = [];

  if (prompt) {
    parts.push({ type: 'text', text: prompt });
  }

  const images = [];
  for (const imageUrl of normalizeMediaArray(inputs.reference || inputs.image_url || inputs.image_urls)) {
    const base64 = await fileToBase64(imageUrl);
    if (!base64) continue;
    images.push(base64);
    parts.push({ type: 'image_url', image_url: { url: base64 } });
  }

  const videos = [];
  for (const videoUrl of normalizeMediaArray(inputs.video || inputs.video_url || inputs.video_urls)) {
    const base64 = await fileToBase64(videoUrl);
    if (!base64) continue;
    videos.push(base64);
    parts.push({ type: 'image_url', image_url: { url: base64 } });
  }

  const audios = [];
  for (const audioUrl of normalizeMediaArray(inputs.audio || inputs.input_audio || inputs.input_audios)) {
    const base64 = await fileToBase64(audioUrl);
    if (!base64) continue;
    const audioPart = toInputAudioPart(base64);
    audios.push(audioPart.input_audio);
    parts.push(audioPart);
  }

  sendProgress?.(`已整理输入素材: 图片 ${images.length}，视频 ${videos.length}，音频 ${audios.length}`);

  return { parts, images, videos, audios };
}

async function downloadRemoteVideo(url) {
  await assertSafeRemoteDownloadUrl(url, '视频下载地址');

  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(REMOTE_VIDEO_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`下载视频失败: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('下载视频失败: 文件超过大小限制');
  }

  const contentType = response.headers.get('content-type') || 'video/mp4';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('下载视频失败: 文件超过大小限制');
  }
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function submitVideoGeneration({
  apiKey,
  baseUrl,
  providerConfig,
  projectModels,
  model,
  prompt,
  duration,
  aspect_ratio,
  resolution,
  image_url,
  image_urls,
  video_url,
  video_urls,
  input_audio,
  input_audios,
  messages,
  signal,
  sendProgress,
}) {
  if (!apiKey) {
    throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');
  }
  if (!model) {
    throw new Error('缺少视频模型 model');
  }
  if (!normalizeTextInput(prompt) && !(image_url || image_urls?.length || video_url || video_urls?.length || input_audio || input_audios?.length || messages?.length)) {
    throw new Error('缺少视频生成输入');
  }

  const runtimeConfig = { apiKey, baseUrl, providerConfig, projectModels };
  const adapter = getProviderAdapter(providerConfig);
  const resolved = resolveModelRuntime(runtimeConfig, model, { expectedType: 'video', purpose: 'video' });
  const resolvedModelId = resolved.model?.modelId || model;
  const endpoint = resolveVideoTasksEndpoint(baseUrl, providerConfig, resolved.endpoint);
  const usesArkVideoTasks = isArkVideoTasksEndpoint(endpoint);
  const normalizedDuration = normalizeDuration(duration);
  const body = usesArkVideoTasks
    ? {
        model: resolvedModelId,
        content: buildArkVideoContent({
          model: resolvedModelId,
          prompt,
          image_url,
          image_urls,
          video_url,
          video_urls,
          input_audio,
          input_audios,
          messages,
        }),
        ...(normalizedDuration !== undefined ? { duration: normalizedDuration } : {}),
        ...(aspect_ratio && aspect_ratio !== 'auto' ? { ratio: aspect_ratio } : {}),
        ...(resolution ? { resolution } : {}),
      }
    : {
        model: resolvedModelId,
        ...(prompt ? { prompt } : {}),
        ...(normalizedDuration !== undefined ? { duration: normalizedDuration } : {}),
        ...(aspect_ratio && aspect_ratio !== 'auto' ? { aspect_ratio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(image_url ? { image_url } : {}),
        ...(image_urls?.length ? { image_urls } : {}),
        ...(video_url ? { video_url } : {}),
        ...(video_urls?.length ? { video_urls } : {}),
        ...(input_audio ? { input_audio } : {}),
        ...(input_audios?.length ? { input_audios } : {}),
        ...(messages?.length ? { messages } : {}),
      };
  sendProgress?.(`调用视频生成接口: ${endpoint}; model=${resolvedModelId}`);
  const response = await adapter.jsonRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint,
    method: 'POST',
    signal,
    errorCode: 'VIDEO_SUBMIT_FAILED',
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderError('VIDEO_SUBMIT_FAILED', data.error?.message || data.message || '视频生成失败');

  const taskId = extractVideoTaskId(data);
  if (taskId) {
    sendProgress?.(`视频生成任务已提交: taskId=${taskId}; endpoint=${endpoint}`);
    return { mode: 'poll', taskId, endpoint, raw: data };
  }

  const videoUrl = extractVideoUrl(data);
  if (videoUrl) {
    return { mode: 'sync', videoUrl, raw: data };
  }

  throw new Error(`未获得任务 ID，也未返回视频结果: ${JSON.stringify(data).slice(0, 200)}`);
}

export async function pollVideoTask({ baseUrl, apiKey, providerConfig, taskId, endpoint: taskEndpoint, signal }) {
  const endpoint = resolveVideoTasksEndpoint(baseUrl, providerConfig, taskEndpoint || providerConfig?.videoEndpoint);
  const adapter = getProviderAdapter(providerConfig);
  const response = await adapter.rawRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint: `${endpoint}/${taskId}`,
    signal,
    errorCode: 'VIDEO_STATUS_FAILED',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderError('VIDEO_STATUS_FAILED', data.error?.message || data.message || `HTTP ${response.status}`);

  return data;
}

export async function waitForVideoTask({ baseUrl, apiKey, providerConfig, taskId, endpoint, signal, sendProgress }) {
  const maxAttempts = 120;
  const intervalMs = 5000;
  let lastProgress = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new Error('工作流已手动停止');
    }
    sendProgress?.(`正在等待视频生成... (${attempt * 5}s)`);

    try {
      const data = await pollVideoTask({ baseUrl, apiKey, providerConfig, taskId, endpoint, signal });
      const status = data.status || data.data?.status;

      if (['succeeded', 'complete', 'completed', 'done'].includes(status)) {
        return extractVideoUrl(data);
      }

      if (['failed', 'error'].includes(status)) {
        const error = data.error || data.data?.error || '视频生成失败';
        throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
      }

      const progress = data.progress || data.data?.progress;
      if (typeof progress === 'number' && progress > lastProgress) {
        lastProgress = progress;
        sendProgress?.(`视频生成进度: ${Math.round(progress * 100)}%`);
      }
    } catch (error) {
      if (String(error?.message || '').includes('视频生成失败')) {
        throw error;
      }
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('工作流已手动停止'));
        }, { once: true });
      }
    });
  }

  throw new Error('视频生成超时(超过 10 分钟)');
}

export async function executeVideoGeneration(request, runtimeConfig, sendProgress) {
  const { apiKey, baseUrl, providerConfig, projectModels, abortSignal } = runtimeConfig;
  const prompt = normalizeTextInput(request.prompt);
  if (!prompt) {
    throw new Error('未提供提示词，请连接文本输入节点。');
  }

  sendProgress?.('正在处理输入素材...');
  const payload = await buildVideoGenerationPayload(prompt, request, sendProgress);

  const task = await submitVideoGeneration({
    apiKey,
    baseUrl,
    providerConfig,
    projectModels,
    model: request.model,
    prompt,
    duration: request.duration || 5,
    aspect_ratio: request.aspect_ratio || 'auto',
    resolution: request.resolution || '720p',
    image_url: payload.images[0] || null,
    image_urls: payload.images,
    video_url: payload.videos[0] || null,
    video_urls: payload.videos,
    input_audio: payload.audios[0] || null,
    input_audios: payload.audios,
    messages: payload.parts.length > 0
      ? [{ role: 'user', content: payload.parts.length === 1 && payload.parts[0].type === 'text' ? payload.parts[0].text : payload.parts }]
      : [],
    signal: abortSignal,
    sendProgress,
  });

  const videoUrl = task.mode === 'sync'
    ? task.videoUrl
    : await waitForVideoTask({
        baseUrl,
        apiKey,
        providerConfig,
        taskId: task.taskId,
        endpoint: task.endpoint,
        signal: abortSignal,
        sendProgress,
      });

  if (!videoUrl) {
    throw new Error('视频生成完成但未返回可用地址');
  }

  sendProgress?.('正在下载并保存视频...');

  if (String(videoUrl).startsWith('data:')) {
    return { video: videoUrl };
  }

  if (String(videoUrl).startsWith('http')) {
    return { video: await downloadRemoteVideo(videoUrl) };
  }

  return { video: videoUrl };
}
