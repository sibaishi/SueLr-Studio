import type {
  ClientDownloadDirectoryState,
  OutboundProxyRuntimePatch,
  OutboundProxyMode,
  StorageSettingsPayload,
  WorkflowConcurrencySettingsPayload,
} from '@/features/settings';
import type { RuntimeCapabilities } from '@/shared/runtime';
import type { ApiConfig, LogEntry, ModelInfo, ProjectModel, ProviderConfig, ThemeMode } from '@/shared/types';
import type { Icon } from '@phosphor-icons/react';
import type { Dispatch, SetStateAction } from 'react';

export type SettingsModuleMeta = {
  id: 'overview' | 'connection' | 'models' | 'workspace' | 'diagnostics';
  label: string;
  desc: string;
  icon: Icon;
  accent: string;
  stat: string;
};

export type SettingsActions = {
  addConfig: () => void;
  addLog: (level: string, message: string) => void;
  applyConfig: (id: string) => void;
  deleteConfig: (id: string) => void;
  addManualProjectModel: (modelId: string, type: ProjectModel['type']) => void;
  importSelectedModels: () => void;
  onClearLogs: () => void;
  removeProjectModels: (modelIds: string[]) => void;
  setActiveConfigName: (value: string) => void;
  setActiveModule: (id: SettingsModuleMeta['id']) => void;
  setConnectionApiKey: (value: string) => void;
  setConnectionBase: (value: string) => void;
  updateProjectModels: (modelIds: string[], patch: Partial<ProjectModel>) => void;
  setProjectModelSearch: (value: string) => void;
  setProviderAuthType: (value: ProviderConfig['authType']) => void;
  setProviderCustomHeaderName: (value: string) => void;
  setProviderCustomPrefix: (value: string) => void;
  setProviderImageTimeoutMs: (value: string) => void;
  setProviderModelsEndpoint: (value: string) => void;
  setSelectedImports: (value: string[]) => void;
  setStoragePathDraft: (value: string) => void;
  clearClientDownloadDirectory: () => Promise<void>;
  setThemeMode: (value: ThemeMode) => void;
  setEdgeStyle: (value: 'bezier' | 'smoothstep') => void;
  pickStoragePath: () => Promise<void>;
  saveStoragePath: () => Promise<void>;
  resetStoragePath: () => Promise<void>;
  restartBackend: () => Promise<void>;
  setBase: (value: string) => void;
  setApiKey: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
  setWorkflowConcurrency: (value: WorkflowConcurrencySettingsPayload) => void;
  setOutboundProxyMode: (value: OutboundProxyMode) => void;
  setOutboundProxyHttpProxy: (value: string) => void;
  setOutboundProxyHttpsProxy: (value: string) => void;
  setOutboundProxyNoProxy: (value: string) => void;
  setApiConfigs: Dispatch<SetStateAction<ApiConfig[]>>;
  testConnection: () => Promise<void>;
  toggleConfigEnabled: (id: string) => void;
  updateConfig: (patch: Partial<ApiConfig>) => void;
  updateProjectModel: (modelId: string, patch: Partial<ProjectModel>) => void;
  updateProviderConfig: (patch: Partial<ProviderConfig>) => void;
};

export type SettingsViewModel = {
  activeConfig?: ApiConfig;
  activeConfigId: string;
  activeModule: SettingsModuleMeta['id'];
  apiConfigs: ApiConfig[];
  apiKey: string;
  base: string;
  filteredProjectModels: ProjectModel[];
  importableModels: ModelInfo[];
  logSummary: LogEntry[];
  logs: LogEntry[];
  models: ModelInfo[];
  providerConfig: ProviderConfig;
  projectModelSearch: string;
  projectModels: ProjectModel[];
  selectedImports: string[];
  storagePathDraft: string;
  storageSettings: StorageSettingsPayload | null;
  clientDownloadDirectory: ClientDownloadDirectoryState | null;
  storagePathPicking: boolean;
  storageSettingsLoading: boolean;
  storageSettingsSaving: boolean;
  backendRestarting: boolean;
  projectBusy: boolean;
  outboundProxySettings: OutboundProxyRuntimePatch;
  runtimeCapabilities: RuntimeCapabilities | null;
  canRestartBackend: boolean;
  canSelectDirectory: boolean;
  connectionStatus: 'idle' | 'testing' | 'success' | 'error';
  connectionResult: string;
  themeMode: ThemeMode;
  themeOptions: Array<{ l: string; v: string }>;
  edgeStyle: 'bezier' | 'smoothstep';
  workflowConcurrency: WorkflowConcurrencySettingsPayload;
};
