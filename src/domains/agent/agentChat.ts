import type { buildSkillCatalog } from './skillPreview';
import { apiRequestOrThrow } from '@/shared/api';
import type { CanvasPlan } from '@/domains/workflow/lib/agentCanvasPlan';
import { getAttachmentKind } from './AgentAttachment';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type ChatMessage = { role: 'user'; content: ContentPart[] } | { role: 'assistant'; content: string };

function imagePart(source: CanvasImageSource, width: number, height: number): ContentPart {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法准备参考画面。');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { type: 'image_url', image_url: { url: canvas.toDataURL('image/jpeg', 0.82) } };
}

function waitForMedia(media: HTMLVideoElement, event: string, signal: AbortSignal, start: () => void) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  return new Promise<void>((resolve, reject) => {
    function finish(error?: unknown) {
      media.removeEventListener(event, ready);
      media.removeEventListener('error', failed);
      timeout.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    }
    const ready = () => finish();
    const failed = () => finish(new Error('浏览器无法解码这个视频。'));
    const aborted = () => finish(timeout.reason);
    if (timeout.aborted) return aborted();
    media.addEventListener(event, ready, { once: true });
    media.addEventListener('error', failed, { once: true });
    timeout.addEventListener('abort', aborted, { once: true });
    try {
      start();
    } catch (error) {
      finish(error);
    }
  });
}

async function videoParts(file: File, signal: AbortSignal): Promise<ContentPart[]> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  const url = URL.createObjectURL(file);
  try {
    await waitForMedia(video, 'loadeddata', signal, () => {
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || !video.videoWidth) throw new Error('无法获取视频画面。');
    const frames: ContentPart[] = [];
    for (const fraction of [0.1, 0.5, 0.9]) {
      const time = video.duration * fraction;
      if (Math.abs(video.currentTime - time) > 0.001) {
        await waitForMedia(video, 'seeked', signal, () => {
          video.currentTime = time;
        });
      }
      frames.push({ type: 'text', text: `参考视频 ${file.name} · ${time.toFixed(1)} 秒画面` });
      frames.push(imagePart(video, video.videoWidth, video.videoHeight));
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function prepareAgentMessage(text: string, files: File[], signal: AbortSignal) {
  if (files.length > 4) throw new Error('每条消息最多附带 4 个参考文件。');
  const content: ContentPart[] = text ? [{ type: 'text', text }] : [];
  for (const file of files) {
    signal.throwIfAborted();
    const kind = getAttachmentKind(file);
    try {
      if (kind === 'text') {
        const limit = 24000;
        const body = await file.slice(0, limit).text();
        content.push({
          type: 'text',
          text: `参考文件：${file.name}\n${body}${file.size > limit ? '\n（仅提供文件开头）' : ''}`,
        });
      } else if (kind === 'image') {
        const bitmap = await createImageBitmap(file);
        try {
          content.push(
            { type: 'text', text: `参考图片：${file.name}` },
            imagePart(bitmap, bitmap.width, bitmap.height),
          );
        } finally {
          bitmap.close();
        }
      } else if (kind === 'video') {
        content.push(...(await videoParts(file, signal)));
      } else {
        content.push({ type: 'text', text: `附件：${file.name}（文件保留在本地，模型无法读取此格式的内容。）` });
      }
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(`${file.name}：${error instanceof Error ? error.message : '无法读取附件。'}`);
    }
  }
  return content;
}

function contentSize(content: ContentPart[]) {
  return content.reduce(
    (total, part) => total + (part.type === 'text' ? part.text.length : part.image_url.url.length),
    0,
  );
}

export function buildAgentHistory(
  content: ContentPart[],
  turns: { content: ContentPart[]; answer?: string }[],
  skills: string[],
): ChatMessage[] {
  let remaining = 12_000_000 - contentSize(content) - skills.reduce((total, skill) => total + skill.length, 0);
  const messages: ChatMessage[] = [{ role: 'user', content }];
  for (const turn of turns.slice(-10).reverse()) {
    if (!turn.answer) continue;
    const answer = turn.answer.slice(0, 32000);
    remaining -= contentSize(turn.content) + answer.length;
    if (remaining < 0) break;
    messages.unshift({ role: 'user', content: turn.content }, { role: 'assistant', content: answer });
  }
  return messages;
}

export type GenerationPlan = {
  kind: 'image' | 'video';
  prompt: string;
  ratio?: string;
  count?: number;
  duration?: number;
};
export type GeneratedMedia = { kind: 'image' | 'video'; urls: string[] };

export function requestAgentGeneration(modelValue: string, plan: GenerationPlan, signal: AbortSignal) {
  const split = modelValue.indexOf('::');
  if (split <= 0) throw new Error('请选择已配置连接中的生成模型。');
  return apiRequestOrThrow<GeneratedMedia>('/api/agent/generate', {
    method: 'POST',
    body: JSON.stringify({ configId: modelValue.slice(0, split), model: modelValue.slice(split + 2), plan }),
    signal,
  });
}

export function requestAgentChat(
  modelValue: string,
  messages: ChatMessage[],
  skills: string[],
  signal: AbortSignal,
  canvasEnabled = false,
  generationKinds: GenerationPlan['kind'][] = [],
  skillCatalog: ReturnType<typeof buildSkillCatalog> = [],
) {
  const split = modelValue.indexOf('::');
  if (split <= 0) throw new Error('请选择已配置连接中的对话模型。');
  return apiRequestOrThrow<{ answer: string; plan?: CanvasPlan; generation?: GenerationPlan; usedSkills?: string[] }>(
    '/api/agent/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        configId: modelValue.slice(0, split),
        model: modelValue.slice(split + 2),
        messages,
        skills,
        canvasEnabled,
        generationKinds,
        skillCatalog,
      }),
      signal,
    },
  );
}

export async function prepareCanvasOutputs(paths: string[], signal: AbortSignal) {
  const files = paths.filter((path) => /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(path)).slice(-2);
  const content: ContentPart[] = [];
  for (const path of files) {
    const name = path.split('/').at(-1) || '产物';
    try {
      const response = await fetch(path, { signal, redirect: 'error' });
      const size = Number(response.headers.get('content-length'));
      if (!response.ok || !size || size > 32 * 1024 * 1024) {
        await response.body?.cancel();
        throw new Error('无法读取或文件过大');
      }
      const blob = await response.blob();
      content.push(...(await prepareAgentMessage('', [new File([blob], name, { type: blob.type })], signal)));
    } catch {
      signal.throwIfAborted();
      content.push({ type: 'text', text: `产物 ${name} 未能提供可评审画面，请根据实际收到的证据判断。` });
    }
  }
  return content;
}
