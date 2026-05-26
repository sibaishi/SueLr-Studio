// ============================================================
// Flow Studio - 通用 Provider 实现
// 工作流仅保留非流式能力；chat 已统一走 shared capability layer
// ============================================================

import { capabilityChatCompletion } from '@/shared/api/capabilities';
import type { ModelInfo } from '../types';
import { catModel, cleanKey } from '../utils';
import type { AIProvider, ChatCompletionParams, ChatCompletionResult, ProviderConfig } from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

export function createProvider(base: string, apiKey: string, config?: Partial<ProviderConfig>): AIProvider {
  const cfg: ProviderConfig = { ...DEFAULT_PROVIDER_CONFIG, ...config };

  // ====== 构建认证请求头 ======
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = cleanKey(apiKey);
    switch (cfg.authType) {
      case 'bearer':
        headers.Authorization = `Bearer ${key}`;
        break;
      case 'api-key':
        headers['X-API-Key'] = key;
        break;
      case 'custom':
        headers[cfg.customHeaderName || 'Authorization'] = `${cfg.customPrefix ?? 'Bearer '}${key}`;
        break;
    }
    return headers;
  }

  // ====== Chat Completion（非流式） ======
  async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const data = await capabilityChatCompletion({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      apiConfig: {
        apiKey,
        baseUrl: base,
        providerConfig: cfg,
      },
    });
    const msg = data.choices?.[0]?.message;
    return {
      content: typeof msg?.content === 'string' ? msg.content : '',
      toolCalls: msg?.tool_calls || null,
      finishReason: data.choices?.[0]?.finish_reason || 'stop',
    };
  }

  // ====== List Models ======
  async function listModels(): Promise<ModelInfo[]> {
    const endpoint = cfg.modelsEndpoint || '/v1/models';
    const res = await fetch(`${base}${endpoint}`, {
      headers: buildHeaders(),
    });
    const data = (await res.json()) as ModelsResponse;
    return (data.data || [])
      .filter((model): model is { id: string } => typeof model.id === 'string')
      .map((model) => ({ id: model.id, cat: catModel(model.id) }));
  }

  return {
    buildHeaders,
    chatCompletion,
    listModels,
    get config() {
      return cfg;
    },
  };
}
