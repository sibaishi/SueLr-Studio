import type { ProjectModel } from '@/domains/workflow/lib/projectModels';
import type { ProviderConfig } from '@/shared/providers/provider-config';

export type Tab = 'chat' | 'workflow' | 'settings';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface ModelInfo {
  id: string;
  cat: 'chat' | 'image' | 'video';
  modelId?: string;
  configId?: string;
  configName?: string;
}

export interface ToolCallState {
  type: 'image' | 'video' | 'workflow' | 'tool';
  status: 'processing' | 'done' | 'failed' | 'cancelled';
  label: string;
  name?: string;
  error?: string;
  runId?: string;
  workflowId?: string;
  workflowName?: string;
  source?: 'persisted' | 'draft';
  detail?: string;
  artifacts?: Array<{
    type: 'image' | 'video' | 'audio' | 'text' | 'file';
    url: string;
    name?: string;
    mimeType?: string;
  }>;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images: string[];
  videoUrl?: string;
  toolCall?: ToolCallState;
  ts: number;
}

export interface AgentRole {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
  tools: ('generate_image' | 'generate_video' | 'web_search')[];
  isCustom?: boolean;
}

export interface Memory {
  id: string;
  content: string;
  convId: string;
  ts: number;
}

export interface Conv {
  id: string;
  title: string;
  model: string;
  roleId?: string;
  msgs: ChatMsg[];
  ts: number;
}

export interface GalleryItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  ts: number;
}

export interface LogEntry {
  time: string;
  level: string;
  msg: string;
}

export interface Colors {
  bg: string;
  card: string;
  card2: string;
  menuBg: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  blue: string;
  green: string;
  red: string;
  orange: string;
  purple: string;
  neutral: string;
}

export interface ApiConfig {
  id: string;
  name: string;
  base: string;
  apiKey: string;
  apiKeySet?: boolean;
  models: ModelInfo[];
  providerConfig?: ProviderConfig;
  projectModels?: ProjectModel[];
}

export interface BridgeRef {
  addToImageGallery: (items: GalleryItem[]) => void;
  addToVideoGallery: (item: GalleryItem) => void;
  addToChatPending: (urls: string[]) => void;
}

export type { ProjectModel } from '@/domains/workflow/lib/projectModels';
export type { ProviderConfig } from '@/shared/providers/provider-config';

export interface ChatCompletionResponse {
  choices?: { message: ChatCompletionMessage; finish_reason?: string }[];
  data?: { url?: string; b64_json?: string }[];
}

export interface ChatCompletionMessage {
  content: string | ContentPart[];
  role?: string;
  tool_calls?: ToolCallDef[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ToolCallDef {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelsResponse {
  data: { id: string }[];
}

export interface TavilySearchResponse {
  results: { title: string; content: string; url: string }[];
  answer?: string;
}
