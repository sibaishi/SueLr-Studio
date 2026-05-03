// ============================================================
// Flow Studio - Provider type definitions
// ============================================================

import type { ModelInfo } from '../types';

export interface ProviderConfig {
  authType: 'bearer' | 'api-key' | 'custom';
  customHeaderName?: string;
  customPrefix?: string;
  videoEndpoint?: string;
  imageEndpoint?: string;
  imageEditEndpoint?: string;
  imageTimeoutMs?: number;
  chatEndpoint?: string;
  modelsEndpoint?: string;
  modelOverrides?: {
    [modelId: string]: {
      type?: 'chat' | 'image' | 'video' | '';
      endpoint?: string;
    };
  };
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  authType: 'bearer',
  chatEndpoint: '/chat/completions',
  modelsEndpoint: '/models',
  imageEndpoint: '/images/generations',
  imageEditEndpoint: '/images/edits',
  imageTimeoutMs: 300000,
  videoEndpoint: '/video/generations',
};

export interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string | any[] }>;
  tools?: any[];
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: any[] | null;
  finishReason: string;
}

export interface AIProvider {
  buildHeaders(): Record<string, string>;
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  listModels(): Promise<ModelInfo[]>;
  readonly config: ProviderConfig;
}
