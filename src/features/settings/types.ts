import type { RuntimeCapabilities } from '@/shared/runtime';
import type { ApiConfig, LogEntry, ModelInfo, ThemeMode } from '@/shared/types';
import type { Dispatch, SetStateAction } from 'react';

export type StreamMode = 'stream' | 'non-stream';

export type StudioSettingsPayload = {
  ui: {
    theme: ThemeMode;
    imageStreamingMode: StreamMode;
    videoStreamingMode: StreamMode;
  };
  runtime: {
    configs: ApiConfig[];
    activeConfigId: string;
    outboundProxy?: OutboundProxySettingsPayload;
  };
  workflow?: {
    concurrency?: WorkflowConcurrencySettingsPayload;
  };
};

export type OutboundProxyRuntimePatch = {
  outboundProxy: OutboundProxySettingsPayload;
};

export type WorkflowConcurrencySettingsPayload = {
  enabled: boolean;
  maxConcurrency: number;
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
  pathsRedacted?: boolean;
  canManagePath?: boolean;
};

export type ClientDownloadDirectoryState = {
  label: string;
  supported: boolean;
};

export type BackendStatusPayload = {
  ok: boolean;
  version: string;
  processInstanceId?: string;
  runtime?: RuntimeCapabilities;
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
  toggleConfigEnabled: (id: string) => void;
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
  edgeStyle: 'bezier' | 'smoothstep';
  setEdgeStyle: (style: 'bezier' | 'smoothstep') => void;
  workflowConcurrency: WorkflowConcurrencySettingsPayload;
  setWorkflowConcurrency: (value: WorkflowConcurrencySettingsPayload) => void;
  projectBusy: boolean;
};
