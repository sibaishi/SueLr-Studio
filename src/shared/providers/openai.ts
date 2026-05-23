import type {
  ChatCompletionParams,
  ChatCompletionResult,
  SearchResult,
  VideoSubmitParams,
  VideoSubmitResult,
} from './types';
import type { ModelInfo } from '@/shared/types';
import { capabilityWebSearch } from '@/shared/api/capabilities';
import { createProvider } from './generic';

export async function chatCompletion(base: string, apiKey: string, params: ChatCompletionParams): Promise<ChatCompletionResult> {
  return createProvider(base, apiKey).chatCompletion(params);
}

export async function submitVideoGeneration(base: string, apiKey: string, params: VideoSubmitParams): Promise<VideoSubmitResult> {
  return createProvider(base, apiKey).submitVideoGeneration(params);
}

export async function listModels(base: string, apiKey: string): Promise<ModelInfo[]> {
  return createProvider(base, apiKey).listModels();
}

export async function tavilySearch(apiKey: string, query: string, maxResults = 5): Promise<SearchResult> {
  const result = await capabilityWebSearch({ query, maxResults, apiConfig: { tavilyApiKey: apiKey } });
  return result.raw;
}
