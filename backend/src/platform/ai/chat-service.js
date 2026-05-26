import { ProviderError } from '../../app/errors/index.js';
import { resolveModelRuntime } from '../../engine/helpers/apiConfig.js';
import { localUrlToDataUrl } from '../media/media-resolver.js';
import { getProviderAdapter } from '../providers/index.js';

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeContentPart(part) {
  if (!part || typeof part !== 'object' || part.type !== 'image_url') return part;
  const url = part.image_url?.url;
  if (typeof url !== 'string') return part;
  return {
    ...part,
    image_url: {
      ...part.image_url,
      url: localUrlToDataUrl(url),
    },
  };
}

export function normalizeChatMessagesForUpstream(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (!message || typeof message !== 'object' || !Array.isArray(message.content)) {
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
}) {
  if (!apiKey) throw new Error(`${cleanText('未配置')} API Key`);
  if (!model) throw new Error('缺少对话模型');

  const adapter = getProviderAdapter(providerConfig);

  const { endpoint } = resolveModelRuntime(
    { projectModels: projectModels || [], providerConfig, endpoint: '', model },
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
