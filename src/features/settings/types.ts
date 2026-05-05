import type { Dispatch, SetStateAction } from 'react';
import type { AgentRole, ApiConfig, LogEntry, Memory, ModelInfo, ThemeMode } from '@/lib/types';

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
  };
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
  mode?: 'watch' | 'spawn' | string;
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
  roles: AgentRole[];
  customRoles: AgentRole[];
  setCustomRoles: Dispatch<SetStateAction<AgentRole[]>>;
  memories: Memory[];
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
  exportMemories: () => string;
  tavilyApiKey: string;
  tavilyApiKeySet: boolean;
  setTavilyApiKey: (value: string) => void;
  setTavilyApiKeySet: (value: boolean) => void;
  projectBusy: boolean;
};
