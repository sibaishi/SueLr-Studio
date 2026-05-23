import { useEffect, useMemo, useState } from 'react';
import { Bot, Brain, CircleDot, Database, Gauge, KeyRound, Layers3, Wallet } from 'lucide-react';
import { LogPanel } from '@/shared/ui/ios';
import { useToast } from '@/providers/ToastContext';
import { useT } from '@/providers/ThemeContext';
import { THEME_LABELS } from '@/app/theme/constants';
import type { ApiConfig, ModelInfo, ProjectModel, ProviderConfig } from '@/shared/types';
import { capabilityWebSearch } from '@/shared/api/capabilities';
import {
  checkSettingsServer,
  clearAccountDetails,
  getRuntimeCapabilitiesSnapshot,
  getBackendStatus,
  loadAccountDetails,
  loadAccountDetailsLogs,
  loadStorageSettings,
  pickStorageDirectory,
  refreshAccountDetails,
  resetStorageSettings,
  restartBackendRequest,
  saveAccountDetails,
  saveStorageSettings,
  useSettingsPanelController,
  waitForBackendReady,
} from '@/features/settings';
import type { SettingsPanelProps, StorageSettingsPayload } from '@/features/settings';
import { createImportedProjectModels, normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import { AgentMemorySection } from './MemorySection';
import { AgentPersonaSection } from './AgentPersonaSection';
import { AccountDetailsSection } from './AccountDetailsSection';
import { ConnectionSettingsSection } from './ConnectionSettingsSection';
import { DefaultsSection } from './DefaultsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { ModelsSection } from './ModelsSection';
import type { SettingsActions, SettingsModuleMeta, SettingsViewModel } from './shared';
import { EmptyStateCard, chipStyle, eyebrowStyle, fuzzyMatch, mutedPanelStyle, panelStyle, sectionTitleStyle } from './styles';

export function SettingsPanel({
  apiConfigs,
  setApiConfigs,
  activeConfigId,
  setActiveConfigId: _setActiveConfigId,
  applyConfig,
  addNewConfig,
  deleteConfig,
  base,
  apiKey,
  setBase,
  setApiKey,
  models,
  setModels,
  addLog,
  logs,
  onClearLogs,
  themeMode,
  setThemeMode,
  agentProfiles,
  customAgentProfiles,
  upsertAgentProfile,
  deleteAgentProfile,
  memories,
  onDeleteMemory,
  onClearMemories,
  exportMemories,
  tavilyApiKey,
  tavilyApiKeySet,
  setTavilyApiKey,
  setTavilyApiKeySet,
  outboundProxy,
  setOutboundProxy,
  workflowConcurrency,
  setWorkflowConcurrency,
  projectBusy,
}: SettingsPanelProps) {
  const T = useT();
  const toast = useToast();
  const [editingProfile, setEditingProfile] = useState<SettingsViewModel['editingProfile']>(null);
  const [projectModelSearch, setProjectModelSearch] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([]);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [activeModule, setActiveModule] = useState<SettingsModuleMeta['id']>('connection');
  const [storageSettings, setStorageSettings] = useState<StorageSettingsPayload | null>(null);
  const [storagePathDraft, setStoragePathDraft] = useState('');
  const [storagePathPicking, setStoragePathPicking] = useState(false);
  const [storageSettingsLoading, setStorageSettingsLoading] = useState(true);
  const [storageSettingsSaving, setStorageSettingsSaving] = useState(false);
  const [backendRestarting, setBackendRestarting] = useState(false);
  const [accountDetails, setAccountDetails] = useState<SettingsViewModel['accountDetails']>(null);
  const [accountDetailsUsername, setAccountDetailsUsername] = useState('');
  const [accountDetailsPassword, setAccountDetailsPassword] = useState('');
  const [accountDetailsLoading, setAccountDetailsLoading] = useState(true);
  const [accountDetailsSaving, setAccountDetailsSaving] = useState(false);
  const [accountDetailsRefreshing, setAccountDetailsRefreshing] = useState(false);
  const [accountDetailsLogs, setAccountDetailsLogs] = useState<SettingsViewModel['accountDetailsLogs']>(null);
  const [accountDetailsLogsLoading, setAccountDetailsLogsLoading] = useState(false);
  const [accountDetailsLogsPage, setAccountDetailsLogsPage] = useState(1);

  const {
    activeConfig,
    providerConfig,
    setActiveConfigName,
    setConnectionApiKey,
    setConnectionBase,
    setProjectModels,
    setProviderAuthType,
    setProviderCustomHeaderName,
    setProviderCustomPrefix,
    setProviderImageTimeoutMs,
    setProviderModelsEndpoint,
    testConnectionAndSyncModels,
    updateProjectModel,
  } = useSettingsPanelController({
    activeConfigId,
    apiConfigs,
    apiKey,
    base,
    addLog,
    setApiConfigs,
    setApiKey,
    setBase,
    setModels,
  });

  const projectModels = useMemo(() => normalizeProjectModels(activeConfig?.projectModels || []), [activeConfig?.projectModels]);
  const importedIds = useMemo(() => new Set(projectModels.map((model) => model.modelId)), [projectModels]);
  const importableModels = useMemo(() => discoveredModels.filter((model) => !importedIds.has(model.id)), [discoveredModels, importedIds]);
  const filteredProjectModels = useMemo(() => projectModels.filter((model) => fuzzyMatch(model.modelId, projectModelSearch)), [projectModelSearch, projectModels]);
  const filteredMemories = useMemo(() => memories.filter((memory) => fuzzyMatch(memory.content, memoryQuery)), [memories, memoryQuery]);
  const themeOptions = Object.entries(THEME_LABELS).map(([value, label]) => ({ l: label, v: value }));
  const logSummary = useMemo(() => logs.slice(0, 5), [logs]);
  const runtimeCapabilities = getRuntimeCapabilitiesSnapshot();
  const canSelectDirectory = runtimeCapabilities?.canSelectDirectory ?? false;
  const canRestartBackend = runtimeCapabilities?.canRestartBackend ?? false;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStorageSettingsLoading(true);
      try {
        const serverOk = await checkSettingsServer().catch(() => false);
        if (!serverOk) {
          if (!cancelled) {
            setStorageSettings(null);
            setStoragePathDraft('');
          }
          return;
        }

        const next = await loadStorageSettings();
        if (cancelled) return;
        setStorageSettings(next);
        setStoragePathDraft(next?.customRoot || '');
      } catch (error) {
        if (!cancelled) {
          addLog('error', error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setStorageSettingsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [addLog]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAccountDetailsLoading(true);
      try {
        const next = await loadAccountDetails();
        if (cancelled) return;
        setAccountDetails(next);
        setAccountDetailsUsername(next?.username || '');
      } catch (error) {
        if (!cancelled) {
          addLog('error', error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setAccountDetailsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [addLog]);

  useEffect(() => {
    if (!accountDetails?.configured) {
      setAccountDetailsLogs(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setAccountDetailsLogsLoading(true);
      try {
        const next = await loadAccountDetailsLogs(accountDetailsLogsPage, 20);
        if (!cancelled) setAccountDetailsLogs(next);
      } catch (error) {
        if (!cancelled) addLog('error', error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setAccountDetailsLogsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [accountDetails?.configured, accountDetailsLogsPage, addLog]);

  const updateConfig = (patch: Partial<ApiConfig>) => {
    if (!activeConfigId) return;
    setApiConfigs((prev) => prev.map((config) => (config.id === activeConfigId ? { ...config, ...patch } : config)));
  };

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    updateConfig({ providerConfig: { ...providerConfig, ...patch } });
  };

  const updateProjectModelAction = (modelId: string, patch: Partial<ProjectModel>) => {
    updateProjectModel(projectModels, modelId, patch);
  };

  const testConnection = async () => {
    const nextModels = await testConnectionAndSyncModels();
    if (nextModels.length > 0) {
      const byId = new Map(nextModels.map((model) => [model.id, model]));
      setDiscoveredModels(Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id)));
    }
  };

  const addConfig = () => {
    applyConfig(addNewConfig());
  };

  const importSelectedModels = () => {
    if (selectedImports.length === 0) return;
    const selected = new Set(selectedImports);
    setProjectModels(createImportedProjectModels(discoveredModels.filter((model) => selected.has(model.id)), projectModels));
    setSelectedImports([]);
    addLog('success', `已导入 ${selectedImports.length} 个模型条目`);
  };

  const removeProjectModel = (modelId: string) => {
    setProjectModels(projectModels.filter((model) => model.modelId !== modelId));
  };

  const saveAgentProfile = async (profile: SettingsViewModel['agentProfiles'][number]) => {
    await upsertAgentProfile(profile);
    setEditingProfile(null);
    addLog('success', `已保存 Agent Persona：${profile.name}`);
  };

  const testSearch = async () => {
    try {
      const data = await capabilityWebSearch({
        query: 'AI 最新资讯',
        maxResults: 3,
        apiConfig: { tavilyApiKey },
      });
      addLog('success', data.content || '联网搜索成功');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    }
  };

  const exportMemoriesToFile = () => {
    const blob = new Blob([exportMemories()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'agent-memories.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveStoragePathAction = async () => {
    const nextPath = storagePathDraft.trim();
    if (!nextPath) {
      addLog('error', '请先选择自定义存储路径');
      return;
    }

    setStorageSettingsSaving(true);
    try {
      const next = await saveStorageSettings(nextPath);
      setStorageSettings(next);
      setStoragePathDraft(next.customRoot || '');
      addLog('success', '存储路径已保存，重启后端后生效');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setStorageSettingsSaving(false);
    }
  };

  const resetStoragePathAction = async () => {
    setStorageSettingsSaving(true);
    try {
      const next = await resetStorageSettings();
      setStorageSettings(next);
      setStoragePathDraft('');
      addLog('success', '存储路径已恢复默认，重启后端后生效');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setStorageSettingsSaving(false);
    }
  };

  const pickStoragePathAction = async () => {
    setStoragePathPicking(true);
    try {
      const selectedPath = await pickStorageDirectory();
      if (!selectedPath) return;
      setStoragePathDraft(selectedPath);
      addLog('success', '已选择自定义存储路径');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setStoragePathPicking(false);
    }
  };

  const restartBackendAction = async () => {
    if (projectBusy) {
      const message = '当前项目仍在运行，请等待任务结束后再重启后端。';
      addLog('warn', message);
      toast(message, 'error');
      return;
    }

    setBackendRestarting(true);
    try {
      const previousStatus = await getBackendStatus().catch(() => null);
      addLog('info', '正在重启后端...');
      toast('正在重启后端...', 'info');

      const result = await restartBackendRequest();

      if (result.mode === 'desktop') {
        const message = '设置已保存，请重启桌面应用以应用新的后端配置。';
        const next = await loadStorageSettings().catch(() => null);
        if (next) {
          setStorageSettings(next);
          setStoragePathDraft(next.customRoot || '');
        }
        addLog('info', message);
        toast(message, 'info');
        return;
      }

      if (result.mode === 'desktop-relaunch') {
        const message = '桌面应用正在重新启动...';
        addLog('info', message);
        toast(message, 'info');
        return;
      }

      await waitForBackendReady({
        previousProcessInstanceId: previousStatus?.processInstanceId,
        timeoutMs: result.mode === 'spawn' ? 25000 : 20000,
        intervalMs: 500,
      });

      const next = await loadStorageSettings().catch(() => null);
      if (next) {
        setStorageSettings(next);
        setStoragePathDraft(next.customRoot || '');
      }

      addLog('success', '后端重启完成');
      toast('后端重启完成', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog('error', message);
      toast(message, 'error');
    } finally {
      setBackendRestarting(false);
    }
  };

  const saveAccountDetailsAction = async () => {
    setAccountDetailsSaving(true);
    try {
      const next = await saveAccountDetails(accountDetailsUsername.trim(), accountDetailsPassword);
      setAccountDetails(next);
      setAccountDetailsUsername(next.username || accountDetailsUsername.trim());
      setAccountDetailsPassword('');
      addLog('success', '账号已登录');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setAccountDetailsSaving(false);
    }
  };

  const refreshAccountDetailsAction = async () => {
    setAccountDetailsRefreshing(true);
    try {
      const next = await refreshAccountDetails();
      setAccountDetails(next);
      setAccountDetailsUsername(next.username || accountDetailsUsername);
      addLog('success', `账号明细已刷新：${next.balance?.balance ?? '-'}`);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setAccountDetailsRefreshing(false);
    }
  };

  const refreshAccountDetailsLogsAction = async () => {
    setAccountDetailsLogsLoading(true);
    try {
      const next = await loadAccountDetailsLogs(accountDetailsLogsPage, 20);
      setAccountDetailsLogs(next);
      addLog('success', `调用日志已刷新：${next.items.length} 条`);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setAccountDetailsLogsLoading(false);
    }
  };

  const clearAccountDetailsAction = async () => {
    setAccountDetailsSaving(true);
    try {
      const next = await clearAccountDetails();
      setAccountDetails(next);
      setAccountDetailsUsername('');
      setAccountDetailsPassword('');
      addLog('success', '账号已清除');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setAccountDetailsSaving(false);
    }
  };

  const modules: SettingsModuleMeta[] = [
    { id: 'connection', label: '连接', desc: 'Provider、鉴权与接口地址', icon: KeyRound, accent: T.blue, stat: base ? '已配置' : '待配置' },
    { id: 'models', label: '模型', desc: '项目模型库与导入管理', icon: Database, accent: T.green, stat: `${projectModels.length} 项` },
    { id: 'defaults', label: '默认项', desc: '主题与工作室基础偏好', icon: CircleDot, accent: T.orange, stat: themeMode },
    { id: 'agent_persona', label: 'Agent Persona', desc: '统一管理 Profile 身份与指令模板', icon: Bot, accent: T.purple, stat: `${agentProfiles.length} 个` },
    { id: 'agent_memory', label: 'Agent Memory', desc: '检索、导出与清理长期记忆', icon: Brain, accent: T.blue, stat: `${memories.length} 条` },
    { id: 'diagnostics', label: '诊断', desc: '运行态可见性与快速检查', icon: Gauge, accent: T.green, stat: `${logs.length} 条` },
  ];

  modules.splice(2, 0, {
    id: 'account_details',
    label: '账号明细',
    desc: '账号登录、余额与调用日志',
    icon: Wallet,
    accent: T.purple,
    stat: accountDetails?.balance ? accountDetails.balance.balance.toFixed(2) : accountDetails?.configured ? '已配置' : '未配置',
  });

  const activeModuleMeta = modules.find((module) => module.id === activeModule) || modules[0];

  const view: SettingsViewModel = {
    accountDetails,
    accountDetailsLoading,
    accountDetailsPassword,
    accountDetailsRefreshing,
    accountDetailsSaving,
    accountDetailsUsername,
    accountDetailsLogs,
    accountDetailsLogsLoading,
    accountDetailsLogsPage,
    activeConfig,
    activeConfigId,
    activeModule,
    agentProfiles,
    apiConfigs,
    apiKey,
    base,
    customAgentProfiles,
    discoveredModels,
    editingProfile,
    filteredMemories,
    filteredProjectModels,
    importableModels,
    logSummary,
    logs,
    memories,
    memoryQuery,
    models,
    outboundProxy,
    providerConfig,
    projectModelSearch,
    projectModels,
    selectedImports,
    storagePathDraft,
    storageSettings,
    storagePathPicking,
    storageSettingsLoading,
    storageSettingsSaving,
    backendRestarting,
    projectBusy,
    runtimeCapabilities,
    canRestartBackend,
    canSelectDirectory,
    tavilyApiKey,
    tavilyApiKeySet,
    themeMode,
    themeOptions,
    workflowConcurrency,
  };

  const actions: SettingsActions = {
    addConfig,
    addLog,
    applyConfig,
    clearAccountDetails: clearAccountDetailsAction,
    deleteAgentProfile,
    deleteConfig,
    exportMemoriesToFile,
    importSelectedModels,
    onClearLogs,
    onClearMemories,
    onDeleteMemory,
    pickStoragePath: pickStoragePathAction,
    removeProjectModel,
    resetStoragePath: resetStoragePathAction,
    restartBackend: restartBackendAction,
    refreshAccountDetails: refreshAccountDetailsAction,
    refreshAccountDetailsLogs: refreshAccountDetailsLogsAction,
    saveAgentProfile,
    saveAccountDetails: saveAccountDetailsAction,
    saveStoragePath: saveStoragePathAction,
    setActiveConfigName,
    setAccountDetailsPassword,
    setAccountDetailsUsername,
    setAccountDetailsLogsPage,
    setActiveModule,
    setApiConfigs,
    setApiKey,
    setBase,
    setConnectionApiKey,
    setConnectionBase,
    setEditingProfile,
    setMemoryQuery,
    setModels,
    setOutboundProxy,
    setWorkflowConcurrency,
    setProjectModelSearch,
    setProviderAuthType,
    setProviderCustomHeaderName,
    setProviderCustomPrefix,
    setProviderImageTimeoutMs,
    setProviderModelsEndpoint,
    setSelectedImports,
    setStoragePathDraft,
    setTavilyApiKey,
    setTavilyApiKeySet,
    setThemeMode,
    testConnection,
    testSearch,
    updateConfig,
    updateProjectModel: updateProjectModelAction,
    updateProviderConfig,
  };

  const workspaceContent = {
    connection: <ConnectionSettingsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    models: <ModelsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    account_details: <AccountDetailsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    defaults: <DefaultsSection actions={actions} view={view} />,
    agent_persona: <AgentPersonaSection actions={actions} view={view} />,
    agent_memory: <AgentMemorySection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    diagnostics: <DiagnosticsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
  }[activeModule];

  return (
    <div
      className="workflow-page"
      data-testid="settings-page"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}
    >
      <div className="workflow-toolbar glass" style={{ marginBottom: 0 }}>
        <div className="workflow-toolbar__frame" style={{ alignItems: 'stretch', flexWrap: 'wrap', rowGap: 12 }}>
          <div className="workflow-toolbar__identity" style={{ minWidth: 220, alignItems: 'flex-start' }}>
            <div className="workflow-toolbar__badge">
              <Layers3 size={20} />
            </div>
            <div>
              <div style={eyebrowStyle()}>Agent 设置</div>
              <div className="workflow-toolbar__title" style={{ fontSize: 18 }}>工作室设置</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                将连接、Persona、Memory 和诊断收拢到统一的 Agent 设置区域中。
              </div>
            </div>
          </div>

          <div className="workflow-toolbar__status" style={{ minWidth: 260, flex: 1, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>当前配置</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>
                {activeConfig?.name || '未命名配置'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={chipStyle(base ? T.green : T.orange)}>{base ? '服务已接入' : '服务待配置'}</span>
              <span style={chipStyle(models.length > 0 ? T.blue : undefined)}>{models.length} 个已发现</span>
              <span style={chipStyle(tavilyApiKey || tavilyApiKeySet ? T.purple : undefined)}>
                {tavilyApiKey || tavilyApiKeySet ? '搜索已启用' : '搜索未启用'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="workflow-shell" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 320px', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        <aside style={{ ...panelStyle(), padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div>
            <div style={eyebrowStyle()}>模块</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>导航</h2>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
              按能力分区浏览统一后的 Agent 设置界面。
            </p>
          </div>

          <div className="flex-col" style={{ gap: 10 }}>
            {modules.map((module) => {
              const Icon = module.icon;
              const active = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module.id)}
                  data-testid={`settings-module-${module.id}`}
                  style={{
                    ...mutedPanelStyle(),
                    textAlign: 'left',
                    padding: 14,
                    cursor: 'pointer',
                    background: active ? `${module.accent}16` : 'var(--color-bg-secondary)',
                    borderColor: active ? `${module.accent}44` : 'var(--color-border)',
                    boxShadow: active ? `0 16px 32px ${module.accent}18` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          flex: '0 0 34px',
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${module.accent}20`,
                          color: module.accent,
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{module.label}</div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)', marginTop: 3, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                          {module.desc}
                        </div>
                      </div>
                    </div>
                    <span style={{ ...chipStyle(active ? module.accent : undefined), padding: '5px 8px' }}>{module.stat}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>概览</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {activeConfig?.name || '未命名配置'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              {base || '接口地址尚未配置'}
            </div>
          </div>
        </aside>

        <main style={{ ...panelStyle(), padding: 18, overflow: 'auto', minWidth: 0 }}>
          <div className="flex-col" style={{ gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={eyebrowStyle()}>{activeModuleMeta.label}</div>
                <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>{activeModuleMeta.desc}</h2>
              </div>
              <span style={chipStyle(activeModuleMeta.accent)}>{activeModuleMeta.stat}</span>
            </div>
            {workspaceContent}
          </div>
        </main>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflow: 'auto' }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>实时概览</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>Agent 总览</h2>
            <div className="flex-col" style={{ gap: 12, marginTop: 14 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>已配置模型</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{projectModels.length}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>已纳入项目模型库</div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>主题模式</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{THEME_LABELS[themeMode]}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>当前工作室显示风格</div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Agent 覆盖情况</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={chipStyle(agentProfiles.length > 0 ? T.purple : undefined)}>{agentProfiles.length} 个 Persona</span>
                  <span style={chipStyle(memories.length > 0 ? T.blue : undefined)}>{memories.length} 条记忆</span>
                  <span style={chipStyle(customAgentProfiles.length > 0 ? T.green : undefined)}>{customAgentProfiles.length} 个自定义</span>
                </div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>最近系统反馈</div>
                <div className="flex-col" style={{ gap: 8 }}>
                  {logSummary.length === 0 && (
                    <EmptyStateCard
                      title="最近还没有日志"
                      body="连接测试、模型导入和诊断操作完成后，这里会显示最近的系统反馈。"
                      action="先做一次连接测试或搜索测试，就能看到这一栏开始产生内容。"
                    />
                  )}
                  {logSummary.map((log, index) => (
                    <div key={`${log.time}-${index}`} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>[{log.time}] </span>
                      {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <LogPanel logs={logs} onClear={onClearLogs} style={{ ...panelStyle(), height: '100%', minHeight: 340, overflow: 'hidden' }} />
        </aside>
      </div>
    </div>
  );
}
