import type { Dispatch, SetStateAction } from 'react';
import type { AgentRole, ApiConfig, LogEntry, Memory, ModelInfo, ProjectModel, ThemeMode } from '@/lib/types';
import type { ProviderConfig } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';

export const ROLE_ICONS = ['bot', 'palette', 'clapperboard', 'code', 'search', 'zap', 'brain', 'lightbulb', 'folder', 'star'];

export type SettingsModuleMeta = {
  id: 'connection' | 'models' | 'defaults' | 'roles' | 'memory' | 'diagnostics';
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
  exportMemoriesToFile: () => void;
  importSelectedModels: () => void;
  onClearLogs: () => void;
  onClearMemories: () => void;
  onDeleteMemory: (id: string) => void;
  removeProjectModel: (modelId: string) => void;
  saveCustomRole: (role: AgentRole) => void;
  setActiveModule: (id: 'connection' | 'models' | 'defaults' | 'roles' | 'memory' | 'diagnostics') => void;
  setEditingRole: (role: AgentRole | null) => void;
  setMemoryQuery: (value: string) => void;
  setProjectModelSearch: (value: string) => void;
  setSelectedImports: (value: string[]) => void;
  setTavilyApiKey: (value: string) => void;
  setTavilyApiKeySet: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  setBase: (value: string) => void;
  setApiKey: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
  setApiConfigs: Dispatch<SetStateAction<ApiConfig[]>>;
  setCustomRoles: Dispatch<SetStateAction<AgentRole[]>>;
  testConnection: () => Promise<void>;
  testSearch: () => Promise<void>;
  updateConfig: (patch: Partial<ApiConfig>) => void;
  updateProjectModel: (modelId: string, patch: Partial<ProjectModel>) => void;
  updateProviderConfig: (patch: Partial<ProviderConfig>) => void;
};

export type SettingsViewModel = {
  activeConfig?: ApiConfig;
  activeConfigId: string;
  activeModule: 'connection' | 'models' | 'defaults' | 'roles' | 'memory' | 'diagnostics';
  apiConfigs: ApiConfig[];
  apiKey: string;
  base: string;
  customRoles: AgentRole[];
  discoveredModels: string[];
  editingRole: AgentRole | null;
  filteredMemories: Memory[];
  filteredProjectModels: ProjectModel[];
  importableModels: string[];
  logSummary: LogEntry[];
  logs: LogEntry[];
  memories: Memory[];
  memoryQuery: string;
  models: ModelInfo[];
  projectModelSearch: string;
  projectModels: ProjectModel[];
  roles: AgentRole[];
  selectedImports: string[];
  tavilyApiKey: string;
  tavilyApiKeySet: boolean;
  themeMode: ThemeMode;
  themeOptions: Array<{ l: string; v: string }>;
};
