import { resolveModelRuntime } from '../engine/helpers/apiConfig.js';
import { getProviderAdapter } from '../src/platform/providers/index.js';
import { ProviderError } from '../src/app/errors/index.js';

function cleanText(value) {
  return String(value || '').trim();
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
  if (!apiKey) throw new Error('未配置 API Key');
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
      messages,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
      ...(tools?.length ? { tools } : {}),
      ...(stream ? { stream: true } : {}),
    },
  });

  if (!response.ok) throw new ProviderError('CHAT_FAILED', '对话请求失败');

  return response;
}
