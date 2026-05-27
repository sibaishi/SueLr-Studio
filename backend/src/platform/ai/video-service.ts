import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ProviderError } from '../../app/errors/index.js';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.js';
import { fileToBase64 } from '../../engine/helpers/fileHelper.js';
import { createLogger } from '../logging/logger.js';
import { getProviderAdapter } from '../providers/index.js';
import { assertSafeRemoteDownloadUrl } from '../security/network-guards.js';
import { STORAGE_PATHS } from '../storage/index.js';

const REMOTE_VIDEO_DOWNLOAD_TIMEOUT_MS = 30_000;
const REMOTE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const ARK_VIDEO_TASKS_ENDPOINT = '/contents/generations/tasks';
const logger = createLogger({ module: 'video-service' });

const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

type ProgressHandler = (message: string) => void;
type JsonRecord = Record<string, unknown>;
type MediaInput = unknown[] | unknown;

interface ProviderConfig extends JsonRecord {
  videoEndpoint?: string;
}

interface RuntimeConfig {
  apiKey?: string;
  baseUrl: string;
  providerConfig?: ProviderConfig;
  projectModels?: unknown[];
  abortSignal?: AbortSignal;
  persistGeneratedOutputs?: boolean;
}

interface VideoMessage {
  content?: unknown;
  [key: string]: unknown;
}

interface AudioPayload {
  data?: unknown;
  format?: unknown;
}

interface VideoGenerationRequest extends JsonRecord {
  model?: string;
  prompt?: unknown;
  duration?: unknown;
  aspect_ratio?: string;
  resolution?: string;
  image_url?: unknown;
  image_urls?: unknown[];
  video_url?: unknown;
  video_urls?: unknown[];
  input_audio?: unknown;
  input_audios?: unknown[];
  messages?: VideoMessage[];
}

interface SubmitVideoGenerationRequest extends RuntimeConfig, VideoGenerationRequest {
  signal?: AbortSignal;
  sendProgress?: ProgressHandler;
}

interface PollVideoTaskRequest extends RuntimeConfig {
  taskId: string;
  endpoint?: string;
  signal?: AbortSignal;
}

interface WaitForVideoTaskRequest extends PollVideoTaskRequest {
  sendProgress?: ProgressHandler;
}

interface VideoGenerationPayload {
  parts: Array<Record<string, unknown>>;
  images: string[];
  videos: string[];
  audios: Array<{ data: string; format: string }>;
}

type VideoTask =
  | { mode: 'poll'; taskId: string; endpoint: string; raw: unknown }
  | { mode: 'sync'; videoUrl: string; raw: unknown };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function getNestedRecord(value: unknown, key: string): JsonRecord {
  return asRecord(asRecord(value)[key]);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeTextInput(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').join('\n');
  }
  return String(value || '').trim();
}

function normalizeMediaArray(value: MediaInput): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '');
  }
  return [value];
}

function summarizeMedia(value: unknown): JsonRecord | null {
  const text = String(value || '');
  const dataMatch = text.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataMatch) {
    return {
      kind: 'data-url',
      mimeType: dataMatch[1],
      base64Length: dataMatch[2].replace(/\s+/g, '').length,
    };
  }
  if (text.startsWith('/api/')) return { kind: 'local-api-url', length: text.length };
  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      return { kind: 'remote-url', host: parsed.host, path: parsed.pathname };
    } catch {
      return { kind: 'remote-url', length: text.length };
    }
  }
  return text ? { kind: 'other', length: text.length } : null;
}

function summarizeMediaList(value: MediaInput): JsonRecord[] {
  return normalizeMediaArray(value)
    .map(summarizeMedia)
    .filter((item): item is JsonRecord => Boolean(item));
}

function normalizeDuration(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const duration = Number(value);
  if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
    throw new Error('瑙嗛鏃堕暱 duration 蹇呴』涓?-1 鎴?4 鍒?15 鐨勬暣鏁扮');
  }
  if (duration === -1) return duration;
  if (duration < 4 || duration > 15) {
    throw new Error('瑙嗛鏃堕暱 duration 蹇呴』涓?-1 鎴?4 鍒?15 鐨勬暣鏁扮');
  }
  return duration;
}

function toInputAudioPart(base64: string): { type: 'input_audio'; input_audio: { data: string; format: string } } {
  const mimeMatch = String(base64).match(/^data:(audio\/[^;]+);/);
  const format = mimeMatch ? mimeMatch[1].split('/')[1] : 'mp3';
  return { type: 'input_audio', input_audio: { data: String(base64).split(',')[1], format } };
}

function isVolcengineArkRuntime(baseUrl: unknown): boolean {
  return String(baseUrl || '')
    .toLowerCase()
    .includes('ark.cn-beijing.volces.com/api/v3');
}

function isArkVideoTasksEndpoint(endpoint: unknown): boolean {
  return String(endpoint || '')
    .toLowerCase()
    .includes('/contents/generations/tasks');
}

function resolveVideoTasksEndpoint(baseUrl: unknown, providerConfig?: ProviderConfig, endpoint?: unknown): string {
  if (isArkVideoTasksEndpoint(endpoint)) return String(endpoint);
  if (isVolcengineArkRuntime(baseUrl)) return ARK_VIDEO_TASKS_ENDPOINT;
  return String(endpoint || providerConfig?.videoEndpoint || '/v1/video/generations');
}

function firstStringByKeys(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return '';
  const keySet = new Set(keys);
  const queue: unknown[] = [value];
  const seen = new Set<object>();
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

function extractVideoTaskId(data: unknown): string {
  const record = asRecord(data);
  const nestedData = getNestedRecord(data, 'data');
  return (
    getString(record.id) ||
    getString(record.task_id) ||
    getString(nestedData.id) ||
    getString(nestedData.task_id) ||
    firstStringByKeys(data, ['id', 'task_id'])
  );
}

function extractVideoUrl(data: unknown): string {
  const record = asRecord(data);
  const output = getNestedRecord(data, 'output');
  const content = getNestedRecord(data, 'content');
  const nestedData = getNestedRecord(data, 'data');
  const nestedDataOutput = getNestedRecord(nestedData, 'output');
  const nestedDataContent = getNestedRecord(nestedData, 'content');
  const nestedDataData = getNestedRecord(nestedData, 'data');
  const nestedDataDataMetadata = getNestedRecord(nestedDataData, 'metadata');
  return (
    getString(record.video_url) ||
    getString(output.video_url) ||
    getString(content.video_url) ||
    getString(nestedData.video_url) ||
    getString(nestedDataOutput.video_url) ||
    getString(nestedDataContent.video_url) ||
    getString(nestedDataDataMetadata.url) ||
    firstStringByKeys(data, ['video_url', 'file_url', 'media_url', 'download_url', 'url']) ||
    getString(record.result_url) ||
    getString(nestedData.result_url)
  );
}

function extractVideoTaskStatus(data: unknown): string {
  return firstStringByKeys(data, ['status', 'state', 'phase']);
}

function normalizeVideoTaskStatus(status: unknown, hasVideoUrl = false, hasError = false): string {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  if (['queued', 'pending', 'submitted', 'created'].includes(normalized)) return 'queued';
  if (['processing', 'running', 'in_progress', 'in-progress', 'progressing'].includes(normalized)) return 'processing';
  if (['succeeded', 'success', 'complete', 'completed', 'done', 'finished'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'errored'].includes(normalized)) return 'failed';
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) return 'cancelled';
  if (hasVideoUrl) return 'completed';
  if (hasError) return 'failed';
  return '';
}

function extractVideoTaskError(data: unknown): string {
  const record = asRecord(data);
  const nestedData = getNestedRecord(data, 'data');
  const direct = record.error || nestedData.error;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object') {
    const nested = firstStringByKeys(direct, ['message', 'detail', 'reason', 'error', 'code']);
    if (nested) return nested;
  }
  return firstStringByKeys(data, ['error', 'message', 'detail', 'reason']);
}

function shouldUseReferenceImageRole(model: unknown, imageCount: number): boolean {
  const normalized = String(model || '').toLowerCase();
  return imageCount > 1 || normalized.includes('seedance-2-');
}

function buildArkVideoContent({
  model,
  prompt,
  image_url,
  image_urls,
  video_url,
  video_urls,
  input_audio,
  input_audios,
  messages,
}: VideoGenerationRequest): Array<Record<string, unknown>> {
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

  const content: Array<Record<string, unknown>> = [];
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
    const audioRecord = asRecord(audio);
    if (audioRecord.data && audioRecord.format) {
      content.push({
        type: 'audio_url',
        audio_url: { url: `data:audio/${audioRecord.format};base64,${audioRecord.data}` },
        role: 'reference_audio',
      });
    } else {
      content.push({ type: 'audio_url', audio_url: { url: audio }, role: 'reference_audio' });
    }
  }

  return content;
}

async function buildVideoGenerationPayload(
  prompt: string,
  inputs: VideoGenerationRequest,
  sendProgress?: ProgressHandler,
): Promise<VideoGenerationPayload> {
  const parts: Array<Record<string, unknown>> = [];

  if (prompt) {
    parts.push({ type: 'text', text: prompt });
  }

  const images: string[] = [];
  for (const imageUrl of normalizeMediaArray(inputs.reference || inputs.image_url || inputs.image_urls)) {
    const base64 = await fileToBase64(imageUrl);
    if (!base64) continue;
    images.push(base64);
    parts.push({ type: 'image_url', image_url: { url: base64 } });
  }

  const videos: string[] = [];
  for (const videoUrl of normalizeMediaArray(inputs.video || inputs.video_url || inputs.video_urls)) {
    const base64 = await fileToBase64(videoUrl);
    if (!base64) continue;
    videos.push(base64);
    parts.push({ type: 'image_url', image_url: { url: base64 } });
  }

  const audios: Array<{ data: string; format: string }> = [];
  for (const audioUrl of normalizeMediaArray(inputs.audio || inputs.input_audio || inputs.input_audios)) {
    const base64 = await fileToBase64(audioUrl);
    if (!base64) continue;
    const audioPart = toInputAudioPart(base64);
    audios.push(audioPart.input_audio);
    parts.push(audioPart);
  }

  sendProgress?.(`宸叉暣鐞嗚緭鍏ョ礌鏉? 鍥剧墖 ${images.length}锛岃棰?${videos.length}锛岄煶棰?${audios.length}`);

  return { parts, images, videos, audios };
}

async function downloadRemoteVideo(url: string): Promise<string> {
  await assertSafeRemoteDownloadUrl(url, '瑙嗛涓嬭浇鍦板潃');

  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(REMOTE_VIDEO_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`涓嬭浇瑙嗛澶辫触: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('涓嬭浇瑙嗛澶辫触: 鏂囦欢瓒呰繃澶у皬闄愬埗');
  }

  const contentType = response.headers.get('content-type') || 'video/mp4';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > REMOTE_VIDEO_MAX_BYTES) {
    throw new Error('涓嬭浇瑙嗛澶辫触: 鏂囦欢瓒呰繃澶у皬闄愬埗');
  }
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function saveGeneratedVideoDataUrl(value: unknown): string | null {
  const match = String(value || '').match(/^data:([^;]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const ext = VIDEO_MIME_EXT[mimeType] || 'mp4';
  const fileName = `videos/${randomUUID()}.${ext}`;
  const filePath = path.join(STORAGE_PATHS.generatedDir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return `/api/outputs/${fileName}`;
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
}: SubmitVideoGenerationRequest): Promise<VideoTask> {
  if (!apiKey) {
    throw new Error('Missing API Key');
  }
  if (!model) {
    throw new Error('缂哄皯瑙嗛妯″瀷 model');
  }
  if (
    !normalizeTextInput(prompt) &&
    !(
      image_url ||
      image_urls?.length ||
      video_url ||
      video_urls?.length ||
      input_audio ||
      input_audios?.length ||
      messages?.length
    )
  ) {
    throw new Error('缂哄皯瑙嗛鐢熸垚杈撳叆');
  }

  const runtimeConfig = { apiKey, baseUrl, providerConfig, projectModels };
  const adapter = getProviderAdapter();
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
  sendProgress?.(`璋冪敤瑙嗛鐢熸垚鎺ュ彛: ${endpoint}; model=${resolvedModelId}`);
  logger.info('video generation request prepared', {
    endpoint,
    model: resolvedModelId,
    mode: usesArkVideoTasks ? 'content' : 'flat',
    promptLength: normalizeTextInput(prompt).length,
    duration: normalizedDuration,
    aspectRatio: aspect_ratio || '',
    resolution: resolution || '',
    imageUrl: summarizeMedia(image_url),
    imageUrls: summarizeMediaList(image_urls),
    videoUrl: summarizeMedia(video_url),
    videoUrls: summarizeMediaList(video_urls),
    inputAudio: summarizeMedia(input_audio),
    inputAudios: summarizeMediaList(input_audios),
    messagesCount: Array.isArray(messages) ? messages.length : 0,
  });
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
  const dataRecord = asRecord(data);
  const dataError = asRecord(dataRecord.error);
  if (!response.ok) {
    throw new ProviderError(
      'VIDEO_SUBMIT_FAILED',
      getString(dataError.message) || getString(dataRecord.message) || 'VIDEO_SUBMIT_FAILED',
    );
  }

  const taskId = extractVideoTaskId(data);
  if (taskId) {
    sendProgress?.(`瑙嗛鐢熸垚浠诲姟宸叉彁浜? taskId=${taskId}; endpoint=${endpoint}`);
    return { mode: 'poll', taskId, endpoint, raw: data };
  }

  const videoUrl = extractVideoUrl(data);
  if (videoUrl) {
    return { mode: 'sync', videoUrl, raw: data };
  }

  throw new Error(`鏈幏寰椾换鍔?ID锛屼篃鏈繑鍥炶棰戠粨鏋? ${JSON.stringify(data).slice(0, 200)}`);
}

export async function pollVideoTask({
  baseUrl,
  apiKey,
  providerConfig,
  taskId,
  endpoint: taskEndpoint,
  signal,
}: PollVideoTaskRequest): Promise<unknown> {
  const endpoint = resolveVideoTasksEndpoint(baseUrl, providerConfig, taskEndpoint || providerConfig?.videoEndpoint);
  const adapter = getProviderAdapter();
  const response = await adapter.rawRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint: `${endpoint}/${taskId}`,
    signal,
    errorCode: 'VIDEO_STATUS_FAILED',
  });

  const data = await response.json().catch(() => ({}));
  const dataRecord = asRecord(data);
  const dataError = asRecord(dataRecord.error);
  if (!response.ok) {
    throw new ProviderError(
      'VIDEO_STATUS_FAILED',
      getString(dataError.message) || getString(dataRecord.message) || `HTTP ${response.status}`,
    );
  }

  return data;
}

export async function waitForVideoTask({
  baseUrl,
  apiKey,
  providerConfig,
  taskId,
  endpoint,
  signal,
  sendProgress,
}: WaitForVideoTaskRequest): Promise<string> {
  const maxAttempts = 120;
  const intervalMs = 5000;
  let lastProgress = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new Error('宸ヤ綔娴佸凡鎵嬪姩鍋滄');
    }
    sendProgress?.(`姝ｅ湪绛夊緟瑙嗛鐢熸垚... (${attempt * 5}s)`);

    try {
      const data = await pollVideoTask({ baseUrl, apiKey, providerConfig, taskId, endpoint, signal });
      const videoUrl = extractVideoUrl(data);
      const rawStatus = extractVideoTaskStatus(data);
      const dataRecord = asRecord(data);
      const status = normalizeVideoTaskStatus(
        rawStatus,
        Boolean(videoUrl),
        Boolean(dataRecord.error || getNestedRecord(data, 'data').error),
      );

      if (status === 'completed') {
        return videoUrl;
      }

      if (status === 'failed' || status === 'cancelled') {
        const normalizedError = extractVideoTaskError(data) || '瑙嗛鐢熸垚澶辫触';
        throw new Error(`瑙嗛鐢熸垚澶辫触: ${normalizedError}`);
      }

      const progress = dataRecord.progress || getNestedRecord(data, 'data').progress;
      if (typeof progress === 'number' && progress > lastProgress) {
        lastProgress = progress;
        sendProgress?.(`瑙嗛鐢熸垚杩涘害: ${Math.round(progress * 100)}%`);
      }
    } catch (error) {
      if (String(error instanceof Error ? error.message : '').includes('瑙嗛鐢熸垚澶辫触')) {
        throw error;
      }
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('宸ヤ綔娴佸凡鎵嬪姩鍋滄'));
          },
          { once: true },
        );
      }
    });
  }

  throw new Error('瑙嗛鐢熸垚瓒呮椂(瓒呰繃 10 鍒嗛挓)');
}

export async function executeVideoGeneration(
  request: VideoGenerationRequest,
  runtimeConfig: RuntimeConfig,
  sendProgress?: ProgressHandler,
): Promise<{ video: string }> {
  const { apiKey, baseUrl, providerConfig, projectModels, abortSignal } = runtimeConfig;
  const shouldPersistGeneratedOutputs = runtimeConfig.persistGeneratedOutputs !== false;
  const prompt = normalizeTextInput(request.prompt);
  if (!prompt) {
    throw new Error('Missing video prompt');
  }

  sendProgress?.('姝ｅ湪澶勭悊杈撳叆绱犳潗...');
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
    messages:
      payload.parts.length > 0
        ? [
            {
              role: 'user',
              content:
                payload.parts.length === 1 && payload.parts[0].type === 'text' ? payload.parts[0].text : payload.parts,
            },
          ]
        : [],
    signal: abortSignal,
    sendProgress,
  });

  const videoUrl =
    task.mode === 'sync'
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
    throw new Error('瑙嗛鐢熸垚瀹屾垚浣嗘湭杩斿洖鍙敤鍦板潃');
  }

  sendProgress?.(shouldPersistGeneratedOutputs ? '姝ｅ湪涓嬭浇骞朵繚瀛樿棰?..' : '姝ｅ湪涓嬭浇瑙嗛...');

  if (String(videoUrl).startsWith('data:')) {
    if (!shouldPersistGeneratedOutputs) return { video: videoUrl };
    return { video: saveGeneratedVideoDataUrl(videoUrl) || videoUrl };
  }

  if (String(videoUrl).startsWith('http')) {
    const downloaded = await downloadRemoteVideo(videoUrl);
    if (!shouldPersistGeneratedOutputs) return { video: downloaded };
    return { video: saveGeneratedVideoDataUrl(downloaded) || downloaded };
  }

  return { video: videoUrl };
}
