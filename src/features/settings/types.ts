import type { Dispatch, SetStateAction } from 'react';
import type { AgentRole, ApiConfig, LogEntry, Memory, ModelInfo, ThemeMode } from '@/lib/types';
import type { AgentProfile } from '@/shared/api/agent';

export type StreamMode = 'stream' | 'non-stream';

export type StudioSettingsPayload = {
  ui: {
    theme: ThemeMode;
    customRoles: AgentRole[];
    lastTab: string;
    sidebarCollapsed: boolean;
    chatStreamingMode: StreamMode;
    imageStreamingMode: StreamMode;
    videoStreamingMode: StreamMode;
  };
  runtime: {
    configs: ApiConfig[];
    activeConfigId: string;
    tavilyApiKey?: string;
    tavilyApiKeySet?: boolean;
    outboundProxy?: OutboundProxySettingsPayload;
  };
};

export type OutboundProxyMode = 'system' | 'direct' | 'custom';

export type OutboundProxySettingsPayload = {
  mode: OutboundProxyMode;
  httpProxy: string;
  httpsProxy: string;
  noProxy: string;
};

export type PublicOutboundProxySettingsPayload = {
  mode: OutboundProxyMode;
  httpProxySet: boolean;
  httpsProxySet: boolean;
  noProxy: string;
};

export type StorageSettingsPayload = {
  effectiveRoot: string;
  defaultRoot: string;
  customRoot: string;
  source: 'env' | 'custom' | 'legacy' | 'default';
  restartRequired: boolean;
  envOverride?: string;
  legacyRoot?: string;
};

export type BackendStatusPayload = {
  ok: boolean;
  version: string;
  processInstanceId?: string;
};

export type BackendRestartPayload = {
  mode?: 'watch' | 'spawn' | 'desktop' | 'desktop-relaunch' | string;
  restartRequired?: boolean;
};

export type SettingsPanelProps = {
  apiConfigs: ApiConfig[];
  setApiConfigs: Dispatch<SetStateAction<ApiConfig[]>>;
  activeConfigId: string;
  setActiveConfigId: (id: string) => void;
  applyConfig: (id: string) => void;
  addNewConfig: () => string;
  deleteConfig: (id: string) => void;
  base: string;
  apiKey: string;
  setBase: (value: string) => void;
  setApiKey: (value: string) => void;
  models: ModelInfo[];
  setModels: (models: ModelInfo[]) => void;
  addLog: (level: string, message: string) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  themeMode: ThemeMode;
  setThemeMode: (theme: ThemeMode) => void;
  agentProfiles: AgentProfile[];
  customAgentProfiles: AgentProfile[];
  upsertAgentProfile: (profile: AgentProfile) => Promise<void>;
  deleteAgentProfile: (profileId: string) => Promise<void>;
  memories: Memory[];
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
  exportMemories: () => string;
  tavilyApiKey: string;
  tavilyApiKeySet: boolean;
  setTavilyApiKey: (value: string) => void;
  setTavilyApiKeySet: (value: boolean) => void;
  outboundProxy: OutboundProxySettingsPayload;
  setOutboundProxy: (value: OutboundProxySettingsPayload) => void;
  projectBusy: boolean;
};
