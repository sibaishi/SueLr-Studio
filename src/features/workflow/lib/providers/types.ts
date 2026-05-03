// ============================================================
// Flow Studio - Workflow provider compatibility types
// ============================================================

import type { ProviderConfig as SharedProviderConfig } from '@/lib/providers';
import { DEFAULT_PROVIDER_CONFIG as SHARED_DEFAULT_PROVIDER_CONFIG } from '@/lib/providers';
import type { ModelInfo } from '../types';

type WorkflowModelOverride = {
  type?: 'chat' | 'image' | 'video' | '';
  endpoint?: string;
};

export interface ProviderConfig extends SharedProviderConfig {
  modelOverrides?: Record<string, WorkflowModelOverride>;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  ...SHARED_DEFAULT_PROVIDER_CONFIG,
  modelOverrides: {},
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
