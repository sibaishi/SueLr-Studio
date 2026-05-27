import { ProviderError } from '../../app/errors/index.js';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.js';
import { localUrlToDataUrl } from '../media/media-resolver.js';
import { getProviderAdapter } from '../providers/index.js';

interface ChatContentImageUrl {
  url?: unknown;
  [key: string]: unknown;
}

interface ChatContentPart {
  type?: unknown;
  image_url?: ChatContentImageUrl;
  [key: string]: unknown;
}

interface ChatCompletionRequest {
  apiKey?: string;
  baseUrl: string;
  providerConfig?: Record<string, unknown>;
  projectModels?: unknown[];
  model?: string;
  messages?: unknown;
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeContentPart(part: unknown): unknown {
  if (!isRecord(part) || part.type !== 'image_url') return part;
  const typedPart = part as ChatContentPart;
  const url = typedPart.image_url?.url;
  if (typeof url !== 'string') return part;
  return {
    ...typedPart,
    image_url: {
      ...typedPart.image_url,
      url: localUrlToDataUrl(url),
    },
  };
}

export function normalizeChatMessagesForUpstream(messages: unknown = []): unknown[] {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: message.content.map(normalizeContentPart),
    };
  });
}

export async function runChatCompletion({
  apiKey,
  baseUrl,
  providerConfig,
  projectModels,
  model,
  messages,
  tools,
  temperature,
  maxTokens,
  stream = false,
  signal,
}: ChatCompletionRequest): Promise<Response> {
  if (!apiKey) throw new Error(`${cleanText('未配置')} API Key`);
  if (!model) throw new Error('缺少对话模型');

  const adapter = getProviderAdapter();

  const { endpoint } = resolveModelRuntime(
    { projectModels: projectModels || [], providerConfig: providerConfig || {}, endpoint: '', model },
    model,
    { expectedType: 'chat', purpose: 'chat' },
  );

  const response = await adapter.jsonRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint,
    method: 'POST',
    signal,
    errorCode: 'CHAT_FAILED',
    body: {
      model,
      messages: normalizeChatMessagesForUpstream(messages),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
      ...(tools?.length ? { tools } : {}),
      ...(stream ? { stream: true } : {}),
    },
  });

  if (!response.ok) throw new ProviderError('CHAT_FAILED', '对话请求失败');

  return response;
}
