// ============================================================
// Flow Studio - Workflow provider compatibility types
// ============================================================

import type { ProviderConfig as SharedProviderConfig } from '@/shared/providers';
import { DEFAULT_PROVIDER_CONFIG as SHARED_DEFAULT_PROVIDER_CONFIG } from '@/shared/providers';
import type { ContentPart, ToolCallDef, ToolDefinition } from '@/shared/types';
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
  messages: Array<{ role: string; content: string | ContentPart[]; tool_calls?: ToolCallDef[] }>;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCallDef[] | null;
  finishReason: string;
}

export interface AIProvider {
  buildHeaders(): Record<string, string>;
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  listModels(): Promise<ModelInfo[]>;
  readonly config: ProviderConfig;
}
