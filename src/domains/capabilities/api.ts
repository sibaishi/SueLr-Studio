import { apiRequestOrThrow } from '@/shared/api';
import type { ProviderConfig } from '@/lib/providers';
import type { ChatCompletionResponse, ContentPart, ToolDefinition } from '@/lib/types';
import type { ProjectModel } from '@/features/workflow/lib/projectModels';

export type ApiConfigPayload = {
  apiKey?: string;
  tavilyApiKey?: string;
  baseUrl?: string;
  projectModels?: ProjectModel[];
  providerConfig?: Partial<ProviderConfig>;
};

export type ImageCapabilityResult = {
  images: string[];
  request: Record<string, unknown>;
};

export async function capabilityChatCompletion(params: {
  model: string;
  messages: Array<{ role: string; content: string | ContentPart[]; tool_calls?: any[] }>;
  tools?: ToolDefinition[];
  apiConfig?: ApiConfigPayload;
}) {
  return apiRequestOrThrow<ChatCompletionResponse>('/api/capabilities/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function capabilityChatCompletionStream(params: {
  model: string;
  messages: Array<{ role: string; content: string | ContentPart[]; tool_calls?: any[] }>;
  tools?: ToolDefinition[];
  apiConfig?: ApiConfigPayload;
  signal?: AbortSignal;
}) {
  const response = await fetch('/api/capabilities/chat?stream=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...params, stream: true, signal: undefined }),
    signal: params.signal,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload?.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // ignore parse failure and keep the HTTP fallback
    }
    throw new Error(message);
  }

  return response;
}

export async function capabilityWebSearch(params: {
  query: string;
  maxResults?: number;
  includeAnswer?: boolean;
  apiConfig?: ApiConfigPayload;
}) {
  return apiRequestOrThrow<{ raw: any; content: string }>('/api/capabilities/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function capabilityGenerateImage(params: {
  model: string;
  prompt: string;
  imageMode?: 'standalone' | 'chat';
  ratio?: string;
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  n?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
  image?: string[];
  mask?: string;
  apiConfig?: ApiConfigPayload;
  signal?: AbortSignal;
}) {
  return apiRequestOrThrow<ImageCapabilityResult>('/api/capabilities/image', {
    method: 'POST',
    body: JSON.stringify({ ...params, signal: undefined }),
    signal: params.signal,
  });
}

export async function capabilitySubmitVideoGeneration(params: {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  image_url?: string;
  image_urls?: string[];
  video_url?: string;
  video_urls?: string[];
  input_audio?: unknown;
  input_audios?: unknown[];
  messages?: Array<{ role: string; content: unknown }>;
  apiConfig?: ApiConfigPayload;
  signal?: AbortSignal;
}) {
  return apiRequestOrThrow<{ mode: 'poll' | 'sync'; taskId?: string; videoUrl?: string; raw?: unknown }>('/api/capabilities/video', {
    method: 'POST',
    body: JSON.stringify({ ...params, signal: undefined }),
    signal: params.signal,
  });
}

export async function capabilityPollVideoTask(taskId: string) {
  return apiRequestOrThrow<{
    status?: string;
    video_url?: string;
    output?: { video_url?: string };
    error?: unknown;
    data?: {
      status?: string;
      video_url?: string;
      output?: { video_url?: string };
      error?: unknown;
    };
  }>(`/api/capabilities/video/${encodeURIComponent(taskId)}`);
}
