import type { ContentPart, ToolCallDef, ToolDefinition, ModelInfo } from '../types';
import type { ProviderConfig } from '../provider-config';

// ====== Provider Configuration (stored in ApiConfig) ======

export type { ProviderConfig } from '../provider-config';

/** 默认配置 = 当前 OpenAI 兼容行为，确保现有功能不受影响 */
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

// ====== API 参数和返回类型 ======

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

// ====== AIProvider 统一接口 ======

/** 流式输出回调 */
export interface StreamCallbacks {
  /** 收到新 token 时调用 */
  onToken: (token: string) => void;
  /** 流式结束时调用（成功或失败都会调用） */
  onFinish: (result: ChatCompletionResult) => void;
  /** 出错时调用 */
  onError: (error: Error) => void;
}

export interface AIProvider {
  /** 构建认证请求头 */
  buildHeaders(): Record<string, string>;
  /** 非流式对话（含 Function Calling） */
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  /** 流式对话（SSE），通过回调实时推送 token */
  chatCompletionStream(params: ChatCompletionParams, callbacks: StreamCallbacks): void;
  /** 提交视频生成任务 */
  submitVideoGeneration(params: VideoSubmitParams): Promise<VideoSubmitResult>;
  /** 流式图像生成（SSE） */
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  /** 获取模型列表 */
  listModels(): Promise<ModelInfo[]>;
  /** 当前配置（只读） */
  readonly config: ProviderConfig;
}
