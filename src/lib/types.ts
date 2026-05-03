import type { ProjectModel } from '../features/workflow/lib/projectModels';
import type { ProviderConfig } from './provider-config';

export type ImageMode = 'standalone' | 'chat';

export type Tab = 'chat' | 'image' | 'video' | 'workflow' | 'settings';
export type ThemeMode = 'dark' | 'light' | 'system';
export type TaskStatus = 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';
export type VideoStatus = '提交中' | '处理中' | '已完成' | '失败' | '已取消';

export interface ModelInfo { id: string; cat: 'chat' | 'image' | 'video'; }
export interface ToolCallState { type: 'image' | 'video'; status: 'processing' | 'done' | 'failed'; label: string; error?: string; }
export interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; images: string[]; videoUrl?: string; toolCall?: ToolCallState; ts: number; }
export interface AgentRole { id: string; name: string; icon: string; systemPrompt: string; tools: ('generate_image' | 'generate_video' | 'web_search')[]; isCustom?: boolean; }
export interface Memory { id: string; content: string; convId: string; ts: number; }
export interface Conv { id: string; title: string; model: string; roleId?: string; msgs: ChatMsg[]; ts: number; }
export interface ImageGenerateParams {
  prompt: string;
  model: string;
  imageMode?: ImageMode;
  ratio: string;
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  n?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
  image?: string[];
  mask?: string;
  effectiveSize?: string;
  sizeSource?: 'auto' | 'ratio' | 'dimensions';
}
export interface ImgTask extends ImageGenerateParams { id: string; refImages: string[]; status: TaskStatus; images: string[]; error?: string; ts: number; }
export interface GalleryItem { id: string; url: string; prompt: string; model: string; ts: number; }
export interface VTask { id: string; taskId: string; status: VideoStatus; prompt: string; model: string; params: string; videoUrl?: string; error?: string; }
export interface LogEntry { time: string; level: string; msg: string; }
export interface Colors { bg: string; card: string; card2: string; menuBg: string; border: string; text: string; text2: string; text3: string; blue: string; green: string; red: string; orange: string; purple: string; neutral: string; }
export interface ApiConfig { id: string; name: string; base: string; apiKey: string; models: ModelInfo[]; providerConfig?: ProviderConfig; projectModels?: ProjectModel[]; }
export interface BridgeRef { addToImageGallery: (items: GalleryItem[]) => void; addToVideoGallery: (item: GalleryItem) => void; addToChatPending: (urls: string[]) => void; }
export type { ProjectModel } from '../features/workflow/lib/projectModels';
export type { ProviderConfig } from './provider-config';

// ====== API Response Types ======
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
    parameters: Record<string, any>;
  };
}
export interface ModelsResponse { data: { id: string }[]; }
export interface TavilySearchResponse { results: { title: string; content: string; url: string }[]; answer?: string; }
