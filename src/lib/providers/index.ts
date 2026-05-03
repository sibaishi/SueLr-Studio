// ====== 兼容函数导出层 ======
export { chatCompletion, submitVideoGeneration, listModels, tavilySearch } from './openai';

// ====== Provider 工厂与类型 ======
export { createProvider } from './generic';
export { DEFAULT_PROVIDER_CONFIG } from './types';
export type { AIProvider, ProviderConfig, ChatCompletionParams, ChatCompletionResult, VideoSubmitParams, VideoSubmitResult, SearchResult, GenerateImageParams, GenerateImageResult } from './types';
