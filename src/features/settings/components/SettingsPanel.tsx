import { THEME_LABELS } from '@/app/theme/constants';
import { createImportedProjectModels, normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import {
  checkSettingsServer,
  getBackendStatus,
  getRuntimeCapabilitiesSnapshot,
  loadClientDownloadDirectoryState,
  loadStorageSettings,
  pickClientDownloadDirectory,
  pickStorageDirectory,
  resetClientDownloadDirectory,
  resetStorageSettings,
  restartBackendRequest,
  saveStorageSettings,
  useSettingsPanelController,
  waitForBackendReady,
} from '@/features/settings';
import type {
  ClientDownloadDirectoryState,
  NetworkSearchSettingsPayload,
  SettingsPanelProps,
  StorageSettingsPayload,
} from '@/features/settings';
import { loadStudioSettings } from '@/features/settings/api';
import { useT } from '@/providers/ThemeContext';
import { useToast } from '@/providers/ToastContext';
import { getRuntimeCapabilities } from '@/shared/api/capabilities';
import { apiRequest } from '@/shared/api/client';
import { setCachedRuntimeCapabilities } from '@/shared/api/serverState';
import type { ApiConfig, ModelInfo, ProjectModel, ProviderConfig } from '@/shared/types';
import { Bot, CircleDot, Database, Gauge, KeyRound, Layers3 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentPersonaSection } from './AgentPersonaSection';
import { ConnectionSettingsSection } from './ConnectionSettingsSection';
import { DefaultsSection } from './DefaultsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { AgentMemorySection } from './MemorySection';
import { ModelsSection } from './ModelsSection';
import type { SettingsActions, SettingsModuleMeta, SettingsViewModel } from './shared';
import { chipStyle, eyebrowStyle, fuzzyMatch, mutedPanelStyle, panelStyle, sectionTitleStyle } from './styles';

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
  const [activeModule, setActiveModule] = useState<SettingsModuleMeta['id']>('overview');
  const [storageSettings, setStorageSettings] = useState<StorageSettingsPayload | null>(null);
  const [storagePathDraft, setStoragePathDraft] = useState('');
  const [storagePathPicking, setStoragePathPicking] = useState(false);
  const [storageSettingsLoading, setStorageSettingsLoading] = useState(true);
  const [storageSettingsSaving, setStorageSettingsSaving] = useState(false);
  const [clientDownloadDirectory, setClientDownloadDirectory] = useState<ClientDownloadDirectoryState | null>(null);
  const [backendRestarting, setBackendRestarting] = useState(false);

  const [networkSearch, setNetworkSearch] = useState<NetworkSearchSettingsPayload>({
    searchEnabled: false,
    tavilyApiKey: '',
    outboundProxy: { mode: 'system', httpProxy: '', httpsProxy: '', noProxy: '' },
  });
  const networkSearchSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const projectModels = useMemo(
    () => normalizeProjectModels(activeConfig?.projectModels || []),
    [activeConfig?.projectModels],
  );
  const importedIds = useMemo(() => new Set(projectModels.map((model) => model.modelId)), [projectModels]);
  const importableModels = useMemo(
    () => discoveredModels.filter((model) => !importedIds.has(model.id)),
    [discoveredModels, importedIds],
  );
  const filteredProjectModels = useMemo(
    () => projectModels.filter((model) => fuzzyMatch(model.modelId, projectModelSearch)),
    [projectModelSearch, projectModels],
  );
  const filteredMemories = useMemo(
    () => memories.filter((memory) => fuzzyMatch(memory.content, memoryQuery)),
    [memories, memoryQuery],
  );
  const themeOptions = Object.entries(THEME_LABELS).map(([value, label]) => ({ l: label, v: value }));
  const runtimeCapabilitiesSnapshot = getRuntimeCapabilitiesSnapshot();
  const [runtimeCapabilities, setRuntimeCapabilities] = useState(runtimeCapabilitiesSnapshot);
  const canSelectDirectory = runtimeCapabilities?.canSelectDirectory ?? false;
  const canRestartBackend = runtimeCapabilities?.canRestartBackend ?? false;
  const isServerRuntime = false;

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
        setClientDownloadDirectory(loadClientDownloadDirectoryState());
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

  // Load network search settings from backend on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const studio = await loadStudioSettings();
        if (cancelled || !studio) return;
        const tavilyApiKey = studio.runtime?.tavilyApiKey || '';
        const searchEnabled =
          typeof studio.runtime?.searchEnabled === 'boolean' ? studio.runtime.searchEnabled : Boolean(tavilyApiKey);
        setNetworkSearch({
          searchEnabled,
          tavilyApiKey,
          outboundProxy: {
            mode: studio.runtime?.outboundProxy?.mode || 'system',
            httpProxy: studio.runtime?.outboundProxy?.httpProxy || '',
            httpsProxy: studio.runtime?.outboundProxy?.httpsProxy || '',
            noProxy: studio.runtime?.outboundProxy?.noProxy || '',
          },
        });
      } catch {
        // Keep defaults if backend unavailable
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (networkSearchSaveTimer.current) {
        clearTimeout(networkSearchSaveTimer.current);
      }
    },
    [],
  );

  // Debounced save for network search settings
  const scheduleNetworkSearchSave = (payload: NetworkSearchSettingsPayload) => {
    if (networkSearchSaveTimer.current) {
      clearTimeout(networkSearchSaveTimer.current);
    }
    networkSearchSaveTimer.current = setTimeout(() => {
      networkSearchSaveTimer.current = null;
      apiRequest('/api/settings/studio', {
        method: 'PUT',
        body: JSON.stringify({ runtime: payload }),
      })
        .then(async () => {
          const fresh = await getRuntimeCapabilities().catch(() => null);
          if (fresh) {
            setCachedRuntimeCapabilities(fresh);
            setRuntimeCapabilities(fresh);
          }
        })
        .catch(() => {});
    }, 800);
  };

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
    setProjectModels(
      createImportedProjectModels(
        discoveredModels.filter((model) => selected.has(model.id)),
        projectModels,
      ),
    );
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

  const exportMemoriesToFile = () => {
    const blob = new Blob([exportMemories()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'agent-memories.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const updateNetworkSearch = (patch: Partial<NetworkSearchSettingsPayload>) => {
    setNetworkSearch((prev) => {
      const next = { ...prev, ...patch };
      scheduleNetworkSearchSave(next);
      return next;
    });
  };

  const setNetworkSearchEnabled = (value: boolean) => {
    updateNetworkSearch({ searchEnabled: value });
  };

  const setNetworkSearchTavilyApiKey = (value: string) => {
    updateNetworkSearch({ tavilyApiKey: value });
  };

  const setNetworkSearchProxyMode = (mode: NetworkSearchSettingsPayload['outboundProxy']['mode']) => {
    setNetworkSearch((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, mode },
      };
      scheduleNetworkSearchSave(next);
      return next;
    });
  };

  const setNetworkSearchHttpProxy = (value: string) => {
    setNetworkSearch((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, httpProxy: value },
      };
      scheduleNetworkSearchSave(next);
      return next;
    });
  };

  const setNetworkSearchHttpsProxy = (value: string) => {
    setNetworkSearch((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, httpsProxy: value },
      };
      scheduleNetworkSearchSave(next);
      return next;
    });
  };

  const setNetworkSearchNoProxy = (value: string) => {
    setNetworkSearch((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, noProxy: value },
      };
      scheduleNetworkSearchSave(next);
      return next;
    });
  };

  const saveStoragePathAction = async () => {
    if (isServerRuntime) {
      if (!clientDownloadDirectory) {
        addLog('error', '请先选择浏览器自动下载目录');
        return;
      }
      addLog('success', `浏览器自动下载目录已生效：${clientDownloadDirectory.label}`);
      return;
    }

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
    if (isServerRuntime) {
      setStorageSettingsSaving(true);
      try {
        await resetClientDownloadDirectory();
        setClientDownloadDirectory(null);
        setStoragePathDraft('');
        addLog('success', '已清除浏览器自动下载目录，下次将回退到手动下载');
      } catch (error) {
        addLog('error', error instanceof Error ? error.message : String(error));
      } finally {
        setStorageSettingsSaving(false);
      }
      return;
    }

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
      if (isServerRuntime) {
        const next = await pickClientDownloadDirectory();
        setClientDownloadDirectory(next);
        setStoragePathDraft(next.label);
        addLog('success', `已授权浏览器自动下载目录：${next.label}`);
        return;
      }

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

  const modules: SettingsModuleMeta[] = [
    {
      id: 'overview',
      label: '总览',
      desc: '设置健康度与常用入口',
      icon: Layers3,
      accent: T.blue,
      stat: activeConfig?.name || '默认',
    },
    {
      id: 'connection',
      label: '连接',
      desc: 'Provider、鉴权与接口地址',
      icon: KeyRound,
      accent: T.blue,
      stat: base ? '已配置' : '待配置',
    },
    {
      id: 'models',
      label: '模型',
      desc: '项目模型库与导入管理',
      icon: Database,
      accent: T.green,
      stat: `${projectModels.length} 项`,
    },
    {
      id: 'agent',
      label: 'Agent',
      desc: 'Persona、记忆与工具身份',
      icon: Bot,
      accent: T.purple,
      stat: `${agentProfiles.length} / ${memories.length}`,
    },
    {
      id: 'workspace',
      label: '工作室',
      desc: '主题与工作室基础偏好',
      icon: CircleDot,
      accent: T.orange,
      stat: themeMode,
    },
    {
      id: 'diagnostics',
      label: '诊断',
      desc: '运行态可见性与快速检查',
      icon: Gauge,
      accent: T.green,
      stat: `${logs.length} 条`,
    },
  ];

  const activeModuleMeta = modules.find((module) => module.id === activeModule) || modules[0];
  const ActiveModuleIcon = activeModuleMeta.icon;

  const view: SettingsViewModel = {
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
    logSummary: [],
    logs,
    memories,
    memoryQuery,
    models,
    providerConfig,
    projectModelSearch,
    projectModels,
    selectedImports,
    storagePathDraft,
    storageSettings,
    clientDownloadDirectory,
    storagePathPicking,
    storageSettingsLoading,
    storageSettingsSaving,
    backendRestarting,
    projectBusy,
    networkSearch,
    runtimeCapabilities,
    canRestartBackend,
    canSelectDirectory,
    themeMode,
    themeOptions,
    workflowConcurrency,
  };

  const actions: SettingsActions = {
    addConfig,
    addLog,
    applyConfig,
    deleteAgentProfile,
    deleteConfig,
    exportMemoriesToFile,
    importSelectedModels,
    onClearLogs,
    onClearMemories,
    onDeleteMemory,
    clearClientDownloadDirectory: resetStoragePathAction,
    pickStoragePath: pickStoragePathAction,
    removeProjectModel,
    resetStoragePath: resetStoragePathAction,
    restartBackend: restartBackendAction,
    saveAgentProfile,
    saveStoragePath: saveStoragePathAction,
    setActiveConfigName,
    setActiveModule,
    setApiConfigs,
    setApiKey,
    setBase,
    setConnectionApiKey,
    setConnectionBase,
    setEditingProfile,
    setMemoryQuery,
    setModels,
    setWorkflowConcurrency,
    setProjectModelSearch,
    setProviderAuthType,
    setProviderCustomHeaderName,
    setProviderCustomPrefix,
    setProviderImageTimeoutMs,
    setProviderModelsEndpoint,
    setSelectedImports,
    setStoragePathDraft,
    setThemeMode,
    testConnection,
    updateConfig,
    updateProjectModel: updateProjectModelAction,
    updateProviderConfig,
    setNetworkSearchEnabled,
    setNetworkSearchTavilyApiKey,
    setNetworkSearchProxyMode,
    setNetworkSearchHttpProxy,
    setNetworkSearchHttpsProxy,
    setNetworkSearchNoProxy,
  };

  const workspaceContent = {
    overview: (
      <div className="flex-col" style={{ gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ ...mutedPanelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>连接</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {base ? '已接入' : '待配置'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
              {activeConfig?.name || '未命名配置'}
            </div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>模型</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {projectModels.length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>项目模型库条目</div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>Agent</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {agentProfiles.length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
              Persona，{memories.length} 条记忆
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 12 }}>
          <div style={{ ...mutedPanelStyle(), padding: 18 }}>
            <div style={eyebrowStyle()}>能力分布</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Chat</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {projectModels.filter((model) => model.type === 'chat' && model.enabled).length}
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Image</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {projectModels.filter((model) => model.type === 'image' && model.enabled).length}
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Video</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {projectModels.filter((model) => model.type === 'video' && model.enabled).length}
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 18 }}>
            <div style={eyebrowStyle()}>运行状态</div>
            <div className="flex-col" style={{ gap: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>运行模式</span>
                <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                  {runtimeCapabilities?.mode || 'local-web'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>联网搜索</span>
                <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                  {runtimeCapabilities?.search?.enabled ? '可用' : '未启用'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>目录选择</span>
                <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                  {canSelectDirectory ? '可用' : '禁用'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...mutedPanelStyle(), padding: 18 }}>
          <div style={eyebrowStyle()}>建议</div>
          <div className="flex-col" style={{ gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setActiveModule('connection')}
              style={{ ...mutedPanelStyle(), padding: 14, textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>检查连接配置</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                管理 Provider、鉴权方式、模型端点和联网搜索代理。
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('models')}
              style={{ ...mutedPanelStyle(), padding: 14, textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>整理项目模型库</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                导入、启用、禁用并标记对话、图像、视频模型能力。
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('agent')}
              style={{ ...mutedPanelStyle(), padding: 14, textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>维护 Agent 行为</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                在同一模块中管理 Persona 与长期记忆，减少设置入口跳转。
              </div>
            </button>
          </div>
        </div>
      </div>
    ),
    connection: <ConnectionSettingsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    models: <ModelsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    agent: (
      <div className="flex-col" style={{ gap: 16 }}>
        <AgentPersonaSection actions={actions} view={view} />
        <AgentMemorySection T={T as unknown as Record<string, string>} actions={actions} view={view} />
      </div>
    ),
    workspace: <DefaultsSection actions={actions} view={view} />,
    diagnostics: <DiagnosticsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
  }[activeModule];

  return (
    <div
      className="workflow-page"
      data-testid="settings-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div className="workflow-toolbar glass" style={{ marginBottom: 0 }}>
        <div
          className="workflow-toolbar__frame"
          style={{ alignItems: 'stretch', flexWrap: 'wrap', gap: 18, padding: '14px 18px', rowGap: 12 }}
        >
          <div className="workflow-toolbar__identity" style={{ minWidth: 260, alignItems: 'flex-start' }}>
            <div className="workflow-toolbar__badge">
              <Layers3 size={20} />
            </div>
            <div>
              <div style={eyebrowStyle()}>Agent 设置</div>
              <div className="workflow-toolbar__title" style={{ fontSize: 18 }}>
                工作室设置
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                集中管理连接、模型、Agent、工作室偏好与运行诊断。
              </div>
            </div>
          </div>

          <div
            className="workflow-toolbar__status"
            style={{ minWidth: 260, flex: 1, justifyContent: 'space-between', padding: '10px 14px 10px 16px' }}
          >
            <div style={{ paddingLeft: 2 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>当前配置</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>
                {activeConfig?.name || '未命名配置'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', paddingRight: 4 }}>
              <span style={chipStyle(base ? T.green : T.orange)}>{base ? '服务已接入' : '服务待配置'}</span>
              <span style={chipStyle(models.length > 0 ? T.blue : undefined)}>{models.length} 个已发现</span>
              <span style={chipStyle(runtimeCapabilities?.search?.enabled ? T.purple : undefined)}>
                {runtimeCapabilities?.search?.enabled ? '联网搜索可用' : '联网搜索未启用'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="workflow-shell"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr) minmax(260px, 300px)',
          gap: 18,
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          padding: '18px 20px 20px',
        }}
      >
        <aside
          style={{
            ...panelStyle(),
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div>
            <div style={eyebrowStyle()}>模块</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>导航</h2>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
              按能力分区浏览设置，减少在相近模块之间来回跳转。
            </p>
          </div>

          <div className="flex-col" style={{ gap: 8, flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
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
                    padding: 12,
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
                          width: 32,
                          height: 32,
                          flex: '0 0 32px',
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {module.label}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            lineHeight: 1.35,
                            color: 'var(--color-text-secondary)',
                            marginTop: 3,
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {module.desc}
                        </div>
                      </div>
                    </div>
                    <span style={{ ...chipStyle(active ? module.accent : undefined), padding: '5px 8px' }}>
                      {module.stat}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ ...mutedPanelStyle(), flex: '0 0 auto', padding: 12 }}>
            <div style={eyebrowStyle()}>当前模块</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${activeModuleMeta.accent}20`,
                  color: activeModuleMeta.accent,
                }}
              >
                <ActiveModuleIcon size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {activeModuleMeta.label}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                  {activeModuleMeta.desc}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main style={{ ...panelStyle(), padding: 18, overflow: 'auto', minWidth: 0 }}>
          <div className="flex-col" style={{ gap: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={eyebrowStyle()}>{activeModuleMeta.label}</div>
                <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>{activeModuleMeta.desc}</h2>
              </div>
              <span style={chipStyle(activeModuleMeta.accent)}>{activeModuleMeta.stat}</span>
            </div>
            {workspaceContent}
          </div>
        </main>

        <aside style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ ...panelStyle(), padding: 16, flex: 1, minHeight: 0, overflow: 'auto' }}>
            <div style={eyebrowStyle()}>实时概览</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>Agent 总览</h2>
            <div className="flex-col" style={{ gap: 12, marginTop: 14, minHeight: 'calc(100% - 48px)' }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>已配置模型</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {projectModels.length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>已纳入项目模型库</div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>当前配置</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {activeConfig?.name || '未命名配置'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: 'var(--color-text-tertiary)',
                    marginTop: 6,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {base || '接口地址尚未配置'}
                </div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>主题模式</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {THEME_LABELS[themeMode]}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                  当前工作室显示风格
                </div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Agent 覆盖情况</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={chipStyle(agentProfiles.length > 0 ? T.purple : undefined)}>
                    {agentProfiles.length} 个 Persona
                  </span>
                  <span style={chipStyle(memories.length > 0 ? T.blue : undefined)}>{memories.length} 条记忆</span>
                  <span style={chipStyle(customAgentProfiles.length > 0 ? T.green : undefined)}>
                    {customAgentProfiles.length} 个自定义
                  </span>
                </div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>运行能力</div>
                <div className="flex-col" style={{ gap: 8, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>目录选择器</span>
                    <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                      {canSelectDirectory ? '可用' : '禁用'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>后端重启</span>
                    <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                      {canRestartBackend ? '可用' : '禁用'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>内置 Shell</span>
                    <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                      {runtimeCapabilities?.hasEmbeddedShell ? '可用' : '禁用'}
                    </strong>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
