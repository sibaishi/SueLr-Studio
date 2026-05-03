/**
 * Legacy function wrappers.
 * Kept only for compatibility and delegated to the shared provider/capability layer.
 */
import type { ChatCompletionParams, ChatCompletionResult, VideoSubmitParams, VideoSubmitResult, SearchResult } from './types';
import type { ModelInfo } from '../types';
import { capabilityWebSearch } from '@/domains/capabilities';
import { createProvider } from './generic';

// ====== Chat Completion (non-streaming, with tool_calls support) ======
export async function chatCompletion(base: string, apiKey: string, params: ChatCompletionParams): Promise<ChatCompletionResult> {
  return createProvider(base, apiKey).chatCompletion(params);
}

// ====== Video Generation Task Submission ======
export async function submitVideoGeneration(base: string, apiKey: string, params: VideoSubmitParams): Promise<VideoSubmitResult> {
  return createProvider(base, apiKey).submitVideoGeneration(params);
}

// ====== List Models ======
export async function listModels(base: string, apiKey: string): Promise<ModelInfo[]> {
  return createProvider(base, apiKey).listModels();
}

// ====== Tavily Web Search ======
export async function tavilySearch(apiKey: string, query: string, maxResults = 5): Promise<SearchResult> {
  const result = await capabilityWebSearch({ query, maxResults, apiConfig: { tavilyApiKey: apiKey } });
  return result.raw;
}
