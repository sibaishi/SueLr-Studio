import type { Dispatch, SetStateAction } from 'react';
import type { ApiConfig, LogEntry, Memory, ModelInfo, ProjectModel, ProviderConfig, ThemeMode } from '@/shared/types';
import type { AccountDetailsLogsPayload, AccountDetailsPayload, OutboundProxySettingsPayload, StorageSettingsPayload, WorkflowConcurrencySettingsPayload } from '@/features/settings';
import type { AgentProfile } from '@/shared/api/agent';
import type { LucideIcon } from 'lucide-react';

export const ROLE_ICONS = ['bot', 'palette', 'clapperboard', 'code', 'search', 'zap', 'brain', 'lightbulb', 'folder', 'star'];

export const AGENT_TOOL_OPTIONS = [
  'web_search',
  'search_memory',
  'memory_write',
  'get_current_time',
  'generate_image',
  'video_generate',
  'workflow_execute',
] as const;

export const MEMORY_MODE_OPTIONS = [
  { l: '自动', v: 'auto' },
  { l: '关闭', v: 'off' },
] as const;

export type SettingsModuleMeta = {
  id: 'connection' | 'models' | 'account_details' | 'defaults' | 'agent_persona' | 'agent_memory' | 'diagnostics';
  label: string;
  desc: string;
  icon: LucideIcon;
  accent: string;
  stat: string;
};

export type SettingsActions = {
  addConfig: () => void;
  addLog: (level: string, message: string) => void;
  applyConfig: (id: string) => void;
  deleteConfig: (id: string) => void;
  clearAccountDetails: () => Promise<void>;
  exportMemoriesToFile: () => void;
  importSelectedModels: () => void;
  onClearLogs: () => void;
  onClearMemories: () => void;
  onDeleteMemory: (id: string) => void;
  removeProjectModel: (modelId: string) => void;
  deleteAgentProfile: (profileId: string) => Promise<void>;
  saveAgentProfile: (profile: AgentProfile) => Promise<void>;
  setActiveConfigName: (value: string) => void;
  setAccountDetailsPassword: (value: string) => void;
  setAccountDetailsUsername: (value: string) => void;
  setActiveModule: (id: SettingsModuleMeta['id']) => void;
  setConnectionApiKey: (value: string) => void;
  setConnectionBase: (value: string) => void;
  setEditingProfile: (profile: AgentProfile | null) => void;
  setMemoryQuery: (value: string) => void;
  setProjectModelSearch: (value: string) => void;
  setProviderAuthType: (value: ProviderConfig['authType']) => void;
  setProviderCustomHeaderName: (value: string) => void;
  setProviderCustomPrefix: (value: string) => void;
  setProviderImageTimeoutMs: (value: string) => void;
  setProviderModelsEndpoint: (value: string) => void;
  setSelectedImports: (value: string[]) => void;
  setStoragePathDraft: (value: string) => void;
  setTavilyApiKey: (value: string) => void;
  setTavilyApiKeySet: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  pickStoragePath: () => Promise<void>;
  saveStoragePath: () => Promise<void>;
  resetStoragePath: () => Promise<void>;
  restartBackend: () => Promise<void>;
  refreshAccountDetails: () => Promise<void>;
  refreshAccountDetailsLogs: () => Promise<void>;
  saveAccountDetails: () => Promise<void>;
  setAccountDetailsLogsPage: (value: number) => void;
  setBase: (value: string) => void;
  setApiKey: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
  setOutboundProxy: (value: OutboundProxySettingsPayload) => void;
  setWorkflowConcurrency: (value: WorkflowConcurrencySettingsPayload) => void;
  setApiConfigs: Dispatch<SetStateAction<ApiConfig[]>>;
  testConnection: () => Promise<void>;
  testSearch: () => Promise<void>;
  updateConfig: (patch: Partial<ApiConfig>) => void;
  updateProjectModel: (modelId: string, patch: Partial<ProjectModel>) => void;
  updateProviderConfig: (patch: Partial<ProviderConfig>) => void;
};

export type SettingsViewModel = {
  activeConfig?: ApiConfig;
  accountDetails: AccountDetailsPayload | null;
  accountDetailsLoading: boolean;
  accountDetailsSaving: boolean;
  accountDetailsRefreshing: boolean;
  accountDetailsLogs: AccountDetailsLogsPayload | null;
  accountDetailsLogsLoading: boolean;
  accountDetailsLogsPage: number;
  activeConfigId: string;
  activeModule: SettingsModuleMeta['id'];
  agentProfiles: AgentProfile[];
  apiConfigs: ApiConfig[];
  apiKey: string;
  base: string;
  accountDetailsPassword: string;
  accountDetailsUsername: string;
  customAgentProfiles: AgentProfile[];
  discoveredModels: ModelInfo[];
  editingProfile: AgentProfile | null;
  filteredMemories: Memory[];
  filteredProjectModels: ProjectModel[];
  importableModels: ModelInfo[];
  logSummary: LogEntry[];
  logs: LogEntry[];
  memories: Memory[];
  memoryQuery: string;
  models: ModelInfo[];
  outboundProxy: OutboundProxySettingsPayload;
  providerConfig: ProviderConfig;
  projectModelSearch: string;
  projectModels: ProjectModel[];
  selectedImports: string[];
  storagePathDraft: string;
  storageSettings: StorageSettingsPayload | null;
  storagePathPicking: boolean;
  storageSettingsLoading: boolean;
  storageSettingsSaving: boolean;
  backendRestarting: boolean;
  projectBusy: boolean;
  tavilyApiKey: string;
  tavilyApiKeySet: boolean;
  themeMode: ThemeMode;
  themeOptions: Array<{ l: string; v: string }>;
  workflowConcurrency: WorkflowConcurrencySettingsPayload;
};
