// ============================================================
// Flow Studio - 兼容函数导出层
// 仅保留向后兼容包装，真实实现已下沉到 shared provider/capability layer
// ============================================================

import type { ChatCompletionParams, ChatCompletionResult } from './types';
import type { ModelInfo } from '../types';
import { capabilityWebSearch } from '@/domains/capabilities';
import { createProvider } from './generic';

/** Chat Completion（非流式） */
export async function chatCompletion(base: string, apiKey: string, params: ChatCompletionParams): Promise<ChatCompletionResult> {
  return createProvider(base, apiKey).chatCompletion(params);
}

/** 获取模型列表 */
export async function listModels(base: string, apiKey: string): Promise<ModelInfo[]> {
  return createProvider(base, apiKey).listModels();
}

/** Tavily 搜索 */
export async function tavilySearch(apiKey: string, query: string, maxResults = 5) {
  const result = await capabilityWebSearch({ query, maxResults, apiConfig: { tavilyApiKey: apiKey } });
  return result.raw;
}
