export interface ProviderConfig {
  authType: 'bearer' | 'api-key' | 'custom';
  customHeaderName?: string;
  customPrefix?: string;
  videoMode: 'poll' | 'none';
  videoEndpoint?: string;
  imageEndpoint?: string;
  imageEditEndpoint?: string;
  imageTimeoutMs?: number;
  chatEndpoint?: string;
  modelsEndpoint?: string;
}
