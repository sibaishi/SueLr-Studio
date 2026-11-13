import { ProviderError, ValidationError } from '../../app/errors/index.ts';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.ts';
import { localUrlToDataUrl } from '../media/media-resolver.ts';
import { getProviderAdapter } from '../providers/index.ts';
import type { RequestScope } from '../runtime/request-scope.ts';

import { buildResponsesChatBody, toChatCompletionResponse } from './responses-chat.ts';

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
  toolChoice?: { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  webSearch?: boolean;
  signal?: AbortSignal;
  scope?: RequestScope;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeContentPart(part: unknown, scope?: RequestScope): unknown {
  if (!isRecord(part) || part.type !== 'image_url') return part;
  const typedPart = part as ChatContentPart;
  const url = typedPart.image_url?.url;
  if (typeof url !== 'string') return part;
  return {
    ...typedPart,
    image_url: {
      ...typedPart.image_url,
      url: localUrlToDataUrl(url, { scope }),
    },
  };
}

export function normalizeChatMessagesForUpstream(messages: unknown = [], scope?: RequestScope): unknown[] {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: message.content.map((part) => normalizeContentPart(part, scope)),
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
  toolChoice,
  temperature,
  maxTokens,
  stream = false,
  webSearch,
  signal,
  scope,
}: ChatCompletionRequest): Promise<Response> {
  if (!model) throw new Error('缺少对话模型');

  const adapter = getProviderAdapter();

  const { endpoint, model: projectModel } = resolveModelRuntime(
    { projectModels: projectModels || [], providerConfig: providerConfig || {}, endpoint: '', model },
    model,
    { expectedType: 'chat', purpose: 'chat' },
  );

  const modelSupportsSearch = 'nativeWebSearch' in projectModel && projectModel.nativeWebSearch === true;
  if (webSearch === true && !modelSupportsSearch) {
    throw new ValidationError(
      'MODEL_WEB_SEARCH_DISABLED',
      `模型「${model}」未开启原生联网，请在设置的模型库中开启后重试`,
    );
  }
  if (!apiKey) throw new Error(`${cleanText('未配置')} API Key`);

  const nativeWebSearch = modelSupportsSearch && webSearch !== false;
  const normalizedMessages = normalizeChatMessagesForUpstream(messages, scope);
  const responsesEndpoint = /\/(?:chat\/completions|responses)\/?$/.test(endpoint)
    ? endpoint.replace(/\/(?:chat\/completions|responses)\/?$/, '/responses')
    : '/v1/responses';

  const response = await adapter.jsonRequest({
    apiKey,
    providerConfig,
    baseUrl,
    endpoint: nativeWebSearch ? responsesEndpoint : endpoint,
    method: 'POST',
    signal,
    errorCode: 'CHAT_FAILED',
    body: nativeWebSearch
      ? {
          ...buildResponsesChatBody(model, normalizedMessages, tools, maxTokens),
          ...(webSearch === true ? { tool_choice: 'required' } : {}),
        }
      : {
          model,
          messages: normalizedMessages,
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
          ...(tools?.length ? { tools, ...(toolChoice && { tool_choice: toolChoice }) } : {}),
          ...(stream ? { stream: true } : {}),
        },
  });

  if (!response.ok) throw new ProviderError('CHAT_FAILED', '对话请求失败');

  return nativeWebSearch ? toChatCompletionResponse(response) : response;
}
