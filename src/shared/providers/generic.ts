import {
  capabilityChatCompletion,
  capabilityChatCompletionStream,
  capabilityGenerateImage,
  capabilitySubmitVideoGeneration,
} from '@/shared/api/capabilities';
import { cleanKey } from '@/shared/runtime';
import type { ChatCompletionResponse, ModelInfo, ToolCallDef } from '@/shared/types';
import { catModel } from './model-family';
import type {
  AIProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  GenerateImageParams,
  GenerateImageResult,
  ProviderConfig,
  StreamCallbacks,
  VideoSubmitParams,
  VideoSubmitResult,
} from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

function getChatMessageContent(message?: { content?: string | unknown[] }): string {
  return typeof message?.content === 'string' ? message.content : '';
}

function buildChatResult(data: ChatCompletionResponse): ChatCompletionResult {
  const choice = data.choices?.[0];
  const message = choice?.message;

  return {
    content: getChatMessageContent(message),
    toolCalls: message?.tool_calls || null,
    finishReason: choice?.finish_reason || 'stop',
  };
}

function emitChatCompletionResult(result: ChatCompletionResult, callbacks: StreamCallbacks, aborted: boolean) {
  if (result.content && !aborted) {
    callbacks.onToken(result.content);
  }
  if (!aborted) {
    callbacks.onFinish(result);
  }
}

export function createProvider(base: string, apiKey: string, config?: Partial<ProviderConfig>): AIProvider {
  const cfg: ProviderConfig = { ...DEFAULT_PROVIDER_CONFIG, ...config };

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
    return buildChatResult(data);
  }

  async function submitVideoGeneration(params: VideoSubmitParams): Promise<VideoSubmitResult> {
    const data = await capabilitySubmitVideoGeneration({
      ...params,
      apiConfig: {
        ...params.apiConfig,
        apiKey,
        baseUrl: base,
        providerConfig: cfg,
      },
      signal: params.signal,
    });
    if (data.mode === 'sync' && data.videoUrl) {
      throw new Error('视频接口返回了同步结果，当前前端仅支持任务轮询模式。');
    }
    if (!data.taskId) {
      throw new Error('未获取到任务ID');
    }
    return { taskId: data.taskId };
  }

  async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    return capabilityGenerateImage({
      ...params,
      apiConfig: {
        ...params.apiConfig,
        apiKey,
        baseUrl: base,
        providerConfig: cfg,
      },
      signal: params.signal,
    });
  }

  function chatCompletionStream(params: ChatCompletionParams, callbacks: StreamCallbacks): void {
    const aborted = false;

    (async () => {
      try {
        const res = await capabilityChatCompletionStream({
          model: params.model,
          messages: params.messages,
          tools: params.tools,
          apiConfig: {
            apiKey,
            baseUrl: base,
            providerConfig: cfg,
          },
          signal: params.signal,
        });
        const contentType = res.headers.get('content-type') || '';
        if (!res.body || contentType.includes('application/json')) {
          const data = (await res.json()) as ChatCompletionResponse;
          emitChatCompletionResult(buildChatResult(data), callbacks, aborted);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';
        let toolCalls: ToolCallDef[] | null = null;
        let finishReason = 'stop';
        let emittedFullMessage = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (choice) {
                if (choice.delta?.content) {
                  fullContent += choice.delta.content;
                  if (!aborted) callbacks.onToken(choice.delta.content);
                }
                if (choice.delta?.tool_calls) {
                  toolCalls = choice.delta.tool_calls;
                }
                if (choice.message?.content && !choice.delta) {
                  fullContent = choice.message.content;
                  emittedFullMessage = true;
                }
                if (choice.message?.tool_calls && !choice.delta) {
                  toolCalls = choice.message.tool_calls;
                }
                if (choice.finish_reason) finishReason = choice.finish_reason;
              }
            } catch {
              // Ignore malformed SSE chunks and keep streaming.
            }
          }
        }
        if (!aborted) {
          if (emittedFullMessage && fullContent) {
            callbacks.onToken(fullContent);
          }
          callbacks.onFinish({
            content: fullContent,
            toolCalls,
            finishReason,
          });
        }
      } catch (err: unknown) {
        if (!aborted) callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }

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
    chatCompletionStream,
    submitVideoGeneration,
    generateImage,
    listModels,
    get config() {
      return cfg;
    },
  };
}
