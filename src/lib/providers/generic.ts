/**
 * 通用 Provider：能力统一入口 + 必要的原生 provider 直连能力。
 * 非流式 chat/image/video 已走 shared capability layer。
 */
import type { AIProvider, ProviderConfig, ChatCompletionParams, ChatCompletionResult, VideoSubmitParams, VideoSubmitResult, GenerateImageParams, GenerateImageResult } from './types';
import type { ModelInfo } from '../types';
import { DEFAULT_PROVIDER_CONFIG } from './types';
import { cleanKey, catModel } from '../utils';
import { capabilityChatCompletion, capabilityChatCompletionStream, capabilityGenerateImage, capabilitySubmitVideoGeneration } from '@/shared/api/capabilities';

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

type ChatResponse = {
  choices?: Array<{
    message?: { content?: string; tool_calls?: any[] };
    finish_reason?: string;
  }>;
};

function emitChatCompletionResult(result: ChatCompletionResult, callbacks: import('./types').StreamCallbacks, aborted: boolean) {
  if (result.content && !aborted) {
    callbacks.onToken(result.content);
  }
  if (!aborted) {
    callbacks.onFinish(result);
  }
}

export function createProvider(base: string, apiKey: string, config?: Partial<ProviderConfig>): AIProvider {
  const cfg: ProviderConfig = { ...DEFAULT_PROVIDER_CONFIG, ...config };

  // ====== 构建认证请求头 ======
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = cleanKey(apiKey);
    switch (cfg.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${key}`;
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

  // ====== Chat Completion ======
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

  // ====== Video Generation ======
  async function submitVideoGeneration(params: VideoSubmitParams): Promise<VideoSubmitResult> {
    const data = await capabilitySubmitVideoGeneration({
      ...params,
      apiConfig: {
        apiKey,
        baseUrl: base,
        providerConfig: cfg,
      },
      signal: params.signal,
    });
    if (data.mode === 'sync' && data.videoUrl) {
      throw new Error('视频接口返回了同步结果，当前前端仅支持任务轮询模式');
    }
    if (!data.taskId) {
      throw new Error('未获得任务ID');
    }
    return { taskId: data.taskId };
  }

  // ====== Image Generation ======
  async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    return capabilityGenerateImage({
      ...params,
      apiConfig: {
        apiKey,
        baseUrl: base,
        providerConfig: cfg,
      },
      signal: params.signal,
    });
  }

  // ====== Streaming Chat Completion (SSE, chat-only path) ======
  function chatCompletionStream(params: ChatCompletionParams, callbacks: import('./types').StreamCallbacks): void {
    let aborted = false;

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
          const data = await res.json() as ChatResponse;
          const msg = data.choices?.[0]?.message;
          emitChatCompletionResult({
            content: typeof msg?.content === 'string' ? msg.content : '',
            toolCalls: msg?.tool_calls || null,
            finishReason: data.choices?.[0]?.finish_reason || 'stop',
          }, callbacks, aborted);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let toolCalls: any[] | null = null;
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
                // Streaming delta tokens
                if (choice.delta?.content) {
                  fullContent += choice.delta.content;
                  if (!aborted) callbacks.onToken(choice.delta.content);
                }
                // Some providers return tool_calls in deltas
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
            } catch {}
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
      } catch (err: any) {
        if (!aborted) callbacks.onError(err);
      }
    })();

    // Return an abort mechanism (not used currently, but for future use)
    return;
  }

  // ====== List Models ======
  async function listModels(): Promise<ModelInfo[]> {
    const endpoint = cfg.modelsEndpoint || '/v1/models';
    const res = await fetch(`${base}${endpoint}`, {
      headers: buildHeaders(),
    });
    const data = await res.json() as ModelsResponse;
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
    get config() { return cfg; },
  };
}
