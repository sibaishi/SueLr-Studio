import { runChatCompletion } from '../../platform/ai/chat-service.ts';
import { runImageGeneration } from '../../platform/ai/image-service.ts';
import { executeVideoGeneration } from '../../platform/ai/video-service.ts';
import { formatWebSearchResult, runWebSearch } from '../../platform/ai/search-service.ts';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.ts';
import { fileToBase64 } from '../helpers/fileHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

// ── helpers ──────────────────────────────────────────────────────

/**
 * Some image APIs return both url and b64_json per generated image.
 * extractImagesFromResponse picks up both, producing duplicate entries.
 * Prefer URLs; for data-only cases, deduplicate identical data URIs.
 */
function dedupePreferUrl(images: DynamicValue[]): DynamicValue[] {
  if (images.length <= 1) return images;
  const urlEntries: string[] = [];
  const dataEntries: string[] = [];
  for (const img of images) {
    const s = String(img);
    if (/^https?:\/\//i.test(s)) urlEntries.push(s);
    else if (s.startsWith('data:')) dataEntries.push(s);
    else urlEntries.push(s);
  }
  // Deduplicate data URIs by value (same base64 downloaded/parsed twice)
  const uniqueData = [...new Set(dataEntries)];
  // If only one kind, return deduped version
  if (urlEntries.length === 0) return uniqueData;
  if (uniqueData.length === 0) return [...new Set(urlEntries)];
  // When counts match, data entries are likely base64 mirrors of URLs
  if (urlEntries.length >= uniqueData.length) return [...new Set(urlEntries)];
  // More data entries than URLs: keep all URLs + excess data entries
  return [...new Set(urlEntries), ...uniqueData.slice(urlEntries.length)];
}

function classifyBySourceType(sourceType: string): 'text' | 'image' | 'video' | 'audio' | null {
  if (!sourceType) return null;
  const t = sourceType.toLowerCase();
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  if (t.includes('image') || t === 'imageinput') return 'image';
  if (t.includes('text') || t.includes('chat') || t.includes('prompt') || t === 'savefile' || t === 'output' || t.includes('iteraterun')) return 'text';
  return null;
}

function classifyByValue(value: unknown): 'text' | 'image' | 'video' | 'audio' | null {
  if (!value) return null;
  const str = String(value);
  if (str.startsWith('data:video/')) return 'video';
  if (str.startsWith('data:audio/')) return 'audio';
  if (str.startsWith('data:image/')) return 'image';
  if (/^https?:\/\/.+\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(str)) return 'video';
  if (/^https?:\/\/.+\.(mp3|wav|ogg|aac|flac)(\?|$)/i.test(str)) return 'audio';
  if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|avif|bmp)(\?|$)/i.test(str)) return 'image';
  if (str.startsWith('http://') || str.startsWith('https://')) return 'image';
  if (/\/api\/files\//.test(str)) return 'image';
  return 'text';
}

function stringifyForSearch(content: DynamicValue) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.filter((p) => p?.type === 'text' && p.text).map((p) => String(p.text).trim()).filter(Boolean).join('\n');
}

async function buildChatContent(text: string, images: DynamicValue[], scope: RuntimeApiConfig['scope']) {
  const parts: DynamicValue[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const img of images) {
    if (!img) continue;
    const b64 = await fileToBase64(img, { scope });
    parts.push({ type: 'image_url', image_url: { url: b64 } });
  }
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

async function parseChatResult(response: Response) {
  const data = (await response.json()) as DynamicValue;
  const msg = data.choices?.[0]?.message || {};
  return { data, message: msg, content: typeof msg.content === 'string' ? msg.content : '', toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [] };
}

function buildSearchPlan(text: DynamicValue) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const isNews = /(新闻|时讯|快讯|头条|资讯|报道|国际)/.test(clean);
  const normalized = clean.replace(/\s+/g, ' ').trim();
  if (/(今天|今日|当天)/.test(normalized)) {
    const d = formatDate(0);
    return { query: normalized.replace(/今天|今日|当天/g, d), topic: isNews ? 'news' : undefined, days: 1, dateHint: d };
  }
  if (/昨天/.test(normalized)) {
    const d = formatDate(-1);
    return { query: normalized.replace(/昨天/g, d), topic: isNews ? 'news' : undefined, days: 2, dateHint: d };
  }
  if (/(最新|最近|刚刚|目前|当前|现在)/.test(normalized)) {
    const d = formatDate(0);
    return { query: `${normalized} ${d}`, topic: isNews ? 'news' : undefined, days: isNews ? 3 : 7, dateHint: d };
  }
  return { query: normalized, topic: isNews ? 'news' : undefined, days: undefined, dateHint: '' };
}

function formatDate(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  return `${y}-${m}-${day}`;
}

// ── mode-specific execution ──────────────────────────────────────

async function executeChatMode(
  prompt: string,
  images: DynamicValue[],
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const model = String(runtimeConfig.model || nodeData.model || 'gpt-4o-mini');
  const systemPrompt = String(nodeData.systemPrompt || '你是一个有帮助的 AI 助手。');
  const enableWebSearch = Boolean(nodeData.enableWebSearch);
  const tavilyKey = String(apiConfig.tavilyApiKey || '').trim();

  const prependSystem = (userPart: DynamicValue): DynamicValue => {
    const sp = systemPrompt || '';
    if (typeof userPart === 'string') return sp ? `${sp}\n${userPart}` : userPart;
    if (Array.isArray(userPart)) return sp ? [{ type: 'text', text: sp + '\n' }, ...userPart] : userPart;
    return userPart;
  };

  if (enableWebSearch && !tavilyKey) throw new Error('已开启联网搜索，但未配置 Tavily API Key');

  sendProgress?.('正在准备输入...');
  const rawContent = await buildChatContent(prompt, images, apiConfig.scope);

  if (enableWebSearch) {
    const plan = buildSearchPlan(stringifyForSearch(rawContent));
    if (!plan?.query) throw new Error('已开启联网搜索，但无法从输入中提取搜索词');
    sendProgress?.(`正在联网搜索：${plan.query}`);
    const searchData = await runWebSearch({ tavilyApiKey: tavilyKey, query: plan.query, maxResults: 5, includeAnswer: true, topic: plan.topic as string | undefined, days: plan.days as number | undefined, signal: apiConfig.abortSignal });
    const ctx = String(formatWebSearchResult(searchData) || '搜索未返回任何结果。');
    const instructions = '已为你提供联网搜索结果。请优先基于这些结果回答；若结果不足或互相冲突，请明确说明不确定性，不要编造。';
    const searchMsg = ['【用户原始请求】', stringifyForSearch(rawContent), '', '【实际搜索词】', plan.query, plan.dateHint ? `时间锚点：${plan.dateHint}` : '', '', '【联网搜索结果】', ctx, '', instructions].filter(Boolean).join('\n');
    const { apiKey, providerConfig, projectModels } = runtimeConfig;
    const baseUrl = String(runtimeConfig.baseUrl || '');
    sendProgress?.('正在生成回答...');
    const resp = await runChatCompletion({ apiKey, baseUrl, providerConfig, projectModels, model, messages: [{ role: 'user', content: prependSystem(searchMsg) }], tools: undefined, stream: false, signal: apiConfig.abortSignal, scope: apiConfig.scope });
    const result = await parseChatResult(resp);
    if (!result.content) throw new Error('AI 返回了空内容');
    return { result: result.content };
  }

  const { apiKey, providerConfig, projectModels } = runtimeConfig;
  const baseUrl = String(runtimeConfig.baseUrl || '');
  sendProgress?.('正在调用 AI 模型...');
  const resp = await runChatCompletion({ apiKey, baseUrl, providerConfig, projectModels, model, messages: [{ role: 'user', content: prependSystem(rawContent) }], tools: undefined, stream: false, signal: apiConfig.abortSignal, scope: apiConfig.scope });
  const result = await parseChatResult(resp);
  if (!result.content) throw new Error('AI 返回了空内容');
  return { result: result.content };
}

async function executeImageMode(
  prompt: string,
  images: DynamicValue[],
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const request = {
    model: runtimeConfig.model || nodeData.model || 'gpt-image-2',
    prompt,
    ratio: nodeData.ratio || 'auto',
    width: nodeData.width,
    height: nodeData.height,
    quality: nodeData.quality,
    resolution: nodeData.resolution,
    n: nodeData.n,
    output_format: nodeData.output_format,
    image: images.length > 0 ? images : undefined,
    mask: nodeData.mask,
  };

  const imgConfig = { ...runtimeConfig, abortSignal: apiConfig?.abortSignal, persistGeneratedOutputs: false };
  const result = (await runImageGeneration(request, imgConfig, sendProgress)) as { images: DynamicValue[]; request?: { model?: DynamicValue } };

  // Some upstream responses include both url and b64_json per image,
  // causing extractImagesFromResponse to return duplicates.
  // Prefer URLs; keep data URIs only when no URL present for that image.
  const deduped = dedupePreferUrl(result.images);
  return { result: deduped, meta: { model: result.request?.model || request.model, count: deduped.length } };
}

async function executeVideoMode(
  prompt: string,
  images: DynamicValue[],
  video: DynamicValue | undefined,
  audio: DynamicValue | undefined,
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const vConfig = { ...runtimeConfig, baseUrl: String(runtimeConfig.baseUrl || ''), abortSignal: apiConfig.abortSignal, persistGeneratedOutputs: false };
  if (!vConfig.apiKey) throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');
  const videoResult = await executeVideoGeneration(
    { model: String(runtimeConfig.model || nodeData.model || 'cogvideox'), prompt, reference: images, video, audio, duration: (nodeData.duration as number) || 5, aspect_ratio: String(nodeData.ratio || 'auto'), resolution: String(nodeData.resolution || '720p') },
    vConfig, sendProgress,
  );
  return { result: videoResult.video };
}

// ── main entry ───────────────────────────────────────────────────

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const rawValues: unknown[] = Array.isArray(inputs.input) ? inputs.input : inputs.input !== undefined ? [inputs.input] : [];
  const sourceTypes: string[] = Array.isArray((inputs as Record<string, unknown>)._inputTypes) ? (inputs as Record<string, unknown>)._inputTypes as string[] : [];

  let prompt = '';
  const images: DynamicValue[] = [];
  let video: DynamicValue | undefined;
  let audio: DynamicValue | undefined;

  for (let i = 0; i < rawValues.length; i++) {
    const value = rawValues[i];
    let type = sourceTypes[i] ? classifyBySourceType(sourceTypes[i]) : null;
    if (!type) type = classifyByValue(value);
    if (!type) type = 'text';

    switch (type) {
      case 'text': prompt = prompt ? `${prompt}\n${String(value)}` : String(value); break;
      case 'image': if (images.length < 9) images.push(value as DynamicValue); break;
      case 'video': if (!video) video = value as DynamicValue; break;
      case 'audio': if (!audio) audio = value as DynamicValue; break;
    }
  }

  const nodeData = (node.data || {}) as Record<string, unknown>;
  const mode = String(nodeData.mode || 'chat');

  // Append panel prompt for image/video modes (not chat)
  if (nodeData.prompt && String(nodeData.prompt).trim() && (mode === 'image' || mode === 'video')) {
    const extra = String(nodeData.prompt).trim();
    prompt = prompt ? `${prompt}\n${extra}` : extra;
  }

  const runtimeConfig = resolveRuntimeApiConfig({}, apiConfig, nodeData.model);
  if (!runtimeConfig.apiKey) throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');

  if (mode === 'image') {
    return executeImageMode(prompt, images, nodeData, runtimeConfig, apiConfig, sendProgress);
  }
  if (mode === 'video') {
    return executeVideoMode(prompt, images, video, audio, nodeData, runtimeConfig, apiConfig, sendProgress);
  }
  // default: chat
  return executeChatMode(prompt, images, nodeData, runtimeConfig, apiConfig, sendProgress);
}
