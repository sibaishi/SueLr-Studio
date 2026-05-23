import type { ContentPart, ToolCallDef, ToolDefinition, ModelInfo } from '@/shared/types';
import type { ProviderConfig } from './provider-config';

export type { ProviderConfig } from './provider-config';

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  authType: 'bearer',
  videoMode: 'poll',
  chatEndpoint: '/v1/chat/completions',
  modelsEndpoint: '/v1/models',
  imageEndpoint: '/v1/images/generations',
  imageEditEndpoint: '/v1/images/edits',
  imageTimeoutMs: 300000,
  videoEndpoint: '/v1/video/generations',
};

export interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string | ContentPart[]; tool_calls?: any[] }>;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCallDef[] | null;
  finishReason: string;
}

export interface VideoSubmitParams {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  image_url?: string;
  image_urls?: string[];
  video_url?: string;
  video_urls?: string[];
  input_audio?: string;
  input_audios?: string[];
  signal?: AbortSignal;
}

export interface VideoSubmitResult {
  taskId: string;
}

export interface SearchResult {
  answer?: string;
  results: Array<{ title: string; content: string; url: string }>;
}

export interface GenerateImageParams {
  model: string;
  prompt: string;
  imageMode?: 'standalone' | 'chat';
  ratio?: string;
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  resolution?: 'auto' | '512px' | '1k' | '2k' | '4k';
  n?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
  image?: string[];
  mask?: string;
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  images?: string[];
  request?: Record<string, unknown>;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onFinish: (result: ChatCompletionResult) => void;
  onError: (error: Error) => void;
}

export interface AIProvider {
  buildHeaders(): Record<string, string>;
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  chatCompletionStream(params: ChatCompletionParams, callbacks: StreamCallbacks): void;
  submitVideoGeneration(params: VideoSubmitParams): Promise<VideoSubmitResult>;
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  listModels(): Promise<ModelInfo[]>;
  readonly config: ProviderConfig;
}
