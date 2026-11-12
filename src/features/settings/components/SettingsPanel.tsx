import { THEME_LABELS } from '@/app/theme/constants';
import {
  createImportedProjectModels,
  createManualProjectModel,
  normalizeProjectModels,
} from '@/domains/workflow/lib/projectModels';
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
  OutboundProxyRuntimePatch,
  SettingsPanelProps,
  StorageSettingsPayload,
} from '@/features/settings';
import { loadStudioSettings } from '@/features/settings/api';
import { useT } from '@/providers/ThemeContext';
import { useToast } from '@/providers/ToastContext';
import { apiRequest } from '@/shared/api/client';
import type { ApiConfig, ModelInfo, ProjectModel, ProviderConfig } from '@/shared/types';
import { Database, Gauge, Key, Stack, Target } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionSettingsSection } from './ConnectionSettingsSection';
import { DefaultsSection } from './DefaultsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { ModelsSection } from './ModelsSection';
import type { SettingsActions, SettingsModuleMeta, SettingsViewModel } from './shared';
import { chipStyle, eyebrowStyle, fuzzyMatch, mutedPanelStyle, panelStyle, sectionTitleStyle } from './styles';
import './settings-panel.css';

export function SettingsPanel({
  apiConfigs,
  setApiConfigs,
  activeConfigId,
  setActiveConfigId: _setActiveConfigId,
  applyConfig,
  addNewConfig,
  deleteConfig,
  toggleConfigEnabled,
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
  edgeStyle,
  setEdgeStyle,
  workflowConcurrency,
  setWorkflowConcurrency,
  projectBusy,
}: SettingsPanelProps) {
  const T = useT();
  const toast = useToast();
  const [projectModelSearch, setProjectModelSearch] = useState('');
  const [discoveries, setDiscoveries] = useState<Record<string, ModelInfo[]>>({});
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [activeModule, setActiveModule] = useState<SettingsModuleMeta['id']>('overview');
  const [storageSettings, setStorageSettings] = useState<StorageSettingsPayload | null>(null);
  const [storagePathDraft, setStoragePathDraft] = useState('');
  const [storagePathPicking, setStoragePathPicking] = useState(false);
  const [storageSettingsLoading, setStorageSettingsLoading] = useState(true);
  const [storageSettingsSaving, setStorageSettingsSaving] = useState(false);
  const [clientDownloadDirectory, setClientDownloadDirectory] = useState<ClientDownloadDirectoryState | null>(null);
  const [backendRestarting, setBackendRestarting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionResult, setConnectionResult] = useState('');
  const connectionDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [outboundProxySettings, setOutboundProxy] = useState<OutboundProxyRuntimePatch>({
    outboundProxy: { mode: 'system', httpProxy: '', httpsProxy: '', noProxy: '' },
  });
  const outboundProxySettingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    updateProjectModels,
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
  const configStats = useMemo(() => {
    const enabled = apiConfigs.filter((c) => c.enabled !== false);
    const allModels = enabled.flatMap((c) => normalizeProjectModels(c.projectModels || []));
    return {
      total: enabled.length,
      totalModels: allModels.length,
      chat: allModels.filter((m) => m.type === 'chat' && m.enabled).length,
      image: allModels.filter((m) => m.type === 'image' && m.enabled).length,
      video: allModels.filter((m) => m.type === 'video' && m.enabled).length,
      midjourney: allModels.filter((m) => m.type === 'midjourney' && m.enabled).length,
    };
  }, [apiConfigs]);
  const importedIds = useMemo(() => new Set(projectModels.map((model) => model.modelId)), [projectModels]);
  const importableModels = useMemo(
    () => (discoveries[activeConfigId] ?? []).filter((model) => !importedIds.has(model.id)),
    [activeConfigId, discoveries, importedIds],
  );
  const filteredProjectModels = useMemo(
    () => projectModels.filter((model) => fuzzyMatch(model.modelId, projectModelSearch)),
    [projectModelSearch, projectModels],
  );
  const themeOptions = Object.entries(THEME_LABELS).map(([value, label]) => ({ l: label, v: value }));
  const runtimeCapabilities = getRuntimeCapabilitiesSnapshot();
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

  // Load outbound proxy settings from backend on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const studio = await loadStudioSettings();
        if (cancelled || !studio) return;
        setOutboundProxy({
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
      if (outboundProxySettingsSaveTimer.current) {
        clearTimeout(outboundProxySettingsSaveTimer.current);
      }
    },
    [],
  );

  // Debounced save for outbound proxy settings
  const scheduleOutboundProxySave = (payload: OutboundProxyRuntimePatch) => {
    if (outboundProxySettingsSaveTimer.current) {
      clearTimeout(outboundProxySettingsSaveTimer.current);
    }
    outboundProxySettingsSaveTimer.current = setTimeout(() => {
      outboundProxySettingsSaveTimer.current = null;
      apiRequest('/api/settings/studio', {
        method: 'PUT',
        body: JSON.stringify({ runtime: payload }),
      }).catch(() => {});
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
    updateProjectModels(projectModels, [modelId], patch);
  };

  const testConnection = async () => {
    if (connectionDismissTimer.current) {
      clearTimeout(connectionDismissTimer.current);
      connectionDismissTimer.current = null;
    }
    setConnectionStatus('testing');
    setConnectionResult('');
    try {
      const nextModels = await testConnectionAndSyncModels();
      if (nextModels.length > 0) {
        const byId = new Map(nextModels.map((model) => [model.id, model]));
        const discoveredModels = Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
        setDiscoveries((previous) => ({ ...previous, [activeConfigId]: discoveredModels }));
        setConnectionStatus('success');
        setConnectionResult(`${nextModels.length} 个模型`);
      } else {
        setConnectionStatus('error');
        setConnectionResult('未发现模型');
      }
    } catch {
      setConnectionStatus('error');
      setConnectionResult('连接失败');
    }
    connectionDismissTimer.current = setTimeout(() => {
      setConnectionStatus('idle');
      setConnectionResult('');
      connectionDismissTimer.current = null;
    }, 3000);
  };

  const addConfig = () => {
    const id = addNewConfig();
    _setActiveConfigId(id);
    setBase('');
    setApiKey('');
    setModels([]);
    setSelectedImports([]);
  };

  const importSelectedModels = () => {
    if (selectedImports.length === 0) return;
    const selected = new Set(selectedImports);
    setProjectModels(
      createImportedProjectModels(
        importableModels.filter((model) => selected.has(model.id)),
        projectModels,
      ),
    );
    setSelectedImports([]);
    addLog('success', `已导入 ${selectedImports.length} 个模型条目`);
  };

  const addManualProjectModel = (modelId: string, type: ProjectModel['type']) => {
    const trimmed = modelId.trim();
    if (!trimmed || !type) return;
    if (projectModels.some((model) => model.modelId === trimmed)) {
      addLog('warn', `模型 ${trimmed} 已存在`);
      return;
    }
    const next = createManualProjectModel(trimmed, type, projectModels);
    setProjectModels(next);
    addLog('success', `已添加模型 ${trimmed}，请完善接口配置`);
  };

  const removeProjectModels = (modelIds: string[]) => {
    const ids = new Set(modelIds);
    setProjectModels(projectModels.filter((model) => !ids.has(model.modelId)));
  };

  const setOutboundProxyMode = (mode: OutboundProxyRuntimePatch['outboundProxy']['mode']) => {
    setOutboundProxy((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, mode },
      };
      scheduleOutboundProxySave(next);
      return next;
    });
  };

  const setOutboundProxyHttpProxy = (value: string) => {
    setOutboundProxy((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, httpProxy: value },
      };
      scheduleOutboundProxySave(next);
      return next;
    });
  };

  const setOutboundProxyHttpsProxy = (value: string) => {
    setOutboundProxy((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, httpsProxy: value },
      };
      scheduleOutboundProxySave(next);
      return next;
    });
  };

  const setOutboundProxyNoProxy = (value: string) => {
    setOutboundProxy((prev) => {
      const next = {
        ...prev,
        outboundProxy: { ...prev.outboundProxy, noProxy: value },
      };
      scheduleOutboundProxySave(next);
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
      icon: Stack,
      accent: T.blue,
      stat: `${configStats.total} 项配置`,
    },
    {
      id: 'connection',
      label: '连接',
      desc: 'Provider、鉴权与接口地址',
      icon: Key,
      accent: T.purple,
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
      id: 'workspace',
      label: '工作室',
      desc: '主题与工作室基础偏好',
      icon: Target,
      accent: T.orange,
      stat: themeMode,
    },
    {
      id: 'diagnostics',
      label: '诊断',
      desc: '运行态可见性与快速检查',
      icon: Gauge,
      accent: T.red,
      stat: `${logs.length} 条`,
    },
  ];

  const activeModuleMeta = modules.find((module) => module.id === activeModule) || modules[0];
  const ActiveModuleIcon = activeModuleMeta.icon;

  const view: SettingsViewModel = {
    activeConfig,
    activeConfigId,
    activeModule,
    apiConfigs,
    apiKey,
    base,
    filteredProjectModels,
    importableModels,
    logSummary: [],
    logs,
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
    outboundProxySettings,
    runtimeCapabilities,
    canRestartBackend,
    canSelectDirectory,
    connectionStatus,
    connectionResult,
    themeMode,
    themeOptions,
    edgeStyle,
    workflowConcurrency,
  };

  const actions: SettingsActions = {
    addConfig,
    addLog,
    addManualProjectModel,
    applyConfig,
    deleteConfig,
    importSelectedModels,
    onClearLogs,
    clearClientDownloadDirectory: resetStoragePathAction,
    pickStoragePath: pickStoragePathAction,
    removeProjectModels,
    resetStoragePath: resetStoragePathAction,
    restartBackend: restartBackendAction,
    saveStoragePath: saveStoragePathAction,
    setActiveConfigName,
    setActiveModule,
    setApiConfigs,
    setApiKey,
    setBase,
    setConnectionApiKey,
    setConnectionBase,
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
    setEdgeStyle,
    testConnection,
    toggleConfigEnabled,
    updateConfig,
    updateProjectModel: updateProjectModelAction,
    updateProjectModels: (ids, patch) => updateProjectModels(projectModels, ids, patch),
    updateProviderConfig,
    setOutboundProxyMode,
    setOutboundProxyHttpProxy,
    setOutboundProxyHttpsProxy,
    setOutboundProxyNoProxy,
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
              {configStats.total} 项配置
            </div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>模型</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {configStats.totalModels}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>跨全部配置</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 12 }}>
          <div style={{ ...mutedPanelStyle(), padding: 18 }}>
            <div style={eyebrowStyle()}>能力分布</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Chat</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.chat}
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Image</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.image}
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Video</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.video}
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>MJ</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.midjourney}
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 18 }}>
            <div style={eyebrowStyle()}>已启用配置</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {configStats.total}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>项配置已启用</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {apiConfigs
                .filter((c) => c.enabled !== false)
                .map((config) => (
                  <span
                    key={config.id}
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '5.2em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {config.name || config.base || config.id}
                  </span>
                ))}
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
                管理 Provider、鉴权方式、模型端点和出站代理。
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('models')}
              style={{ ...mutedPanelStyle(), padding: 14, textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>整理项目模型库</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                导入、启用、禁用并标记对话、图像、视频、MJ 模型能力。
              </div>
            </button>
          </div>
        </div>
      </div>
    ),
    connection: <ConnectionSettingsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    models: <ModelsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
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
        gap: 10,
        padding: 10,
      }}
    >
      <div className="settings-panel__header glass">
        <div className="settings-panel__identity">
          <div style={eyebrowStyle()}>Studio Settings</div>
          <h2 style={{ ...sectionTitleStyle(), marginTop: 6 }}>工作室设置</h2>
          <p className="settings-panel__description">集中管理连接、模型、工作室偏好与运行诊断。</p>
        </div>

        <div className="settings-panel__status">
          <div className="settings-panel__active-config">
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>当前配置</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>
              {activeConfig?.name || '未命名配置'}
            </div>
          </div>
          <div className="settings-panel__badges">
            <span style={chipStyle(base ? T.green : T.orange)}>{base ? '服务已接入' : '服务待配置'}</span>
            <span style={chipStyle(models.length > 0 ? T.blue : undefined)}>{models.length} 个已发现</span>
          </div>
        </div>
      </div>

      <div
        className="workflow-shell"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr) minmax(260px, 300px)',
          gap: 10,
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          padding: 0,
        }}
      >
        <aside
          style={{
            ...panelStyle(),
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
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

        <main style={{ ...panelStyle(), padding: 10, overflow: 'auto', minWidth: 0 }}>
          <div className="flex-col" style={{ gap: 10 }}>
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
          <div
            style={{ ...panelStyle(), padding: 10, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            <div>
              <div style={eyebrowStyle()}>实时概览</div>
              <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>系统概览</h2>
            </div>
            <div className="flex-col" style={{ gap: 10, marginTop: 14, flex: 1 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>已配置模型</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.totalModels}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>跨全部配置</div>
              </div>

              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>已启用配置</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                  {configStats.total}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>项 API 配置</div>
              </div>
            </div>

            <div style={{ ...mutedPanelStyle(), padding: 14, flexShrink: 0 }}>
              <div style={eyebrowStyle()}>主题模式</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
                {THEME_LABELS[themeMode]}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                当前工作室显示风格
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
