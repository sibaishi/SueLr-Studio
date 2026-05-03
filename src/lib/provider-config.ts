export interface ProviderConfig {
  /** 认证方式 */
  authType: 'bearer' | 'api-key' | 'custom';
  /** 自定义 Header 名（authType 为 custom 时使用） */
  customHeaderName?: string;
  /** 自定义前缀（authType 为 custom 时使用，如 'Key'、''） */
  customPrefix?: string;
  /** 视频生成方式 */
  videoMode: 'poll' | 'none';
  /** 视频接口路径（默认 /v1/video/generations） */
  videoEndpoint?: string;
  /** 图像生成接口路径（默认 /v1/images/generations） */
  imageEndpoint?: string;
  /** 图像编辑接口路径（默认 /v1/images/edits） */
  imageEditEndpoint?: string;
  /** 图像请求超时（毫秒） */
  imageTimeoutMs?: number;
  /** 对话接口路径（默认 /v1/chat/completions） */
  chatEndpoint?: string;
  /** 模型列表接口路径（默认 /v1/models） */
  modelsEndpoint?: string;
}
