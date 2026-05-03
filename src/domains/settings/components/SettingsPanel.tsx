import { useMemo, useState } from 'react';
import { Bot, Brain, CircleDot, Database, Gauge, KeyRound, Layers3 } from 'lucide-react';
import { LogPanel } from '@/components/ios';
import { useT } from '@/contexts/ThemeContext';
import { THEME_LABELS } from '@/lib/constants';
import type { AgentRole, ApiConfig, ProjectModel } from '@/lib/types';
import type { ProviderConfig } from '@/lib/types';
import { capabilityWebSearch } from '@/domains/capabilities';
import { useSettingsPanelController } from '@/domains/settings';
import type { SettingsPanelProps } from '@/domains/settings';
import { createImportedProjectModels, normalizeProjectModels } from '@/features/workflow/lib/projectModels';
import { ConnectionSettingsSection } from './ConnectionSettingsSection';
import { DefaultsSection } from './DefaultsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { MemorySection } from './MemorySection';
import { ModelsSection } from './ModelsSection';
import { RolesSection } from './RolesSection';
import type { SettingsActions, SettingsModuleMeta, SettingsViewModel } from './shared';
import { EmptyStateCard, chipStyle, eyebrowStyle, mutedPanelStyle, panelStyle, sectionTitleStyle, fuzzyMatch } from './styles';

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
  roles,
  customRoles,
  setCustomRoles,
  memories,
  onDeleteMemory,
  onClearMemories,
  exportMemories,
  tavilyApiKey,
  tavilyApiKeySet,
  setTavilyApiKey,
  setTavilyApiKeySet,
}: SettingsPanelProps) {
  const T = useT();
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [projectModelSearch, setProjectModelSearch] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [activeModule, setActiveModule] = useState<SettingsModuleMeta['id']>('connection');

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
  const importableModels = useMemo(() => discoveredModels.filter((id) => !importedIds.has(id)), [discoveredModels, importedIds]);
  const filteredProjectModels = useMemo(() => projectModels.filter((model) => fuzzyMatch(model.modelId, projectModelSearch)), [projectModelSearch, projectModels]);
  const filteredMemories = useMemo(() => memories.filter((memory) => fuzzyMatch(memory.content, memoryQuery)), [memories, memoryQuery]);
  const themeOptions = Object.entries(THEME_LABELS).map(([value, label]) => ({ l: label, v: value }));
  const logSummary = useMemo(() => logs.slice(0, 5), [logs]);

  const updateConfig = (patch: Partial<ApiConfig>) => {
    if (!activeConfigId) return;
    setApiConfigs((prev) => prev.map((config) => (config.id === activeConfigId ? { ...config, ...patch } : config)));
  };

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    const nextProviderConfig = { ...providerConfig, ...patch };
    updateConfig({ providerConfig: nextProviderConfig });
  };

  const updateProjectModelAction = (modelId: string, patch: Partial<ProjectModel>) => {
    updateProjectModel(projectModels, modelId, patch);
  };

  const testConnection = async () => {
    const nextModels = await testConnectionAndSyncModels();
    if (nextModels.length > 0) {
      setDiscoveredModels([...new Set(nextModels.map((model) => model.id))].sort((a, b) => a.localeCompare(b)));
    }
  };

  const addConfig = () => {
    applyConfig(addNewConfig());
  };

  const importSelectedModels = () => {
    if (selectedImports.length === 0) return;
    setProjectModels(createImportedProjectModels(selectedImports, projectModels));
    setSelectedImports([]);
    addLog('success', `已导入 ${selectedImports.length} 个模型`);
  };

  const removeProjectModel = (modelId: string) => {
    setProjectModels(projectModels.filter((model) => model.modelId !== modelId));
  };

  const saveCustomRole = (role: AgentRole) => {
    setCustomRoles((prev) => prev.some((item) => item.id === role.id) ? prev.map((item) => (item.id === role.id ? role : item)) : [...prev, role]);
    setEditingRole(null);
  };

  const testSearch = async () => {
    try {
      const data = await capabilityWebSearch({ query: 'AI 最新新闻', maxResults: 3, apiConfig: { tavilyApiKey } });
      addLog('success', data.content || '搜索成功');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    }
  };

  const exportMemoriesToFile = () => {
    const blob = new Blob([exportMemories()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'memories.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const modules: SettingsModuleMeta[] = [
    { id: 'connection', label: '连接', desc: 'Provider、鉴权与端点', icon: KeyRound, accent: T.blue, stat: base ? '已配置' : '待填写' },
    { id: 'models', label: '模型', desc: '项目模型库与导入', icon: Database, accent: T.green, stat: `${projectModels.length} 项` },
    { id: 'defaults', label: '默认项', desc: '主题与界面偏好', icon: CircleDot, accent: T.orange, stat: themeMode },
    { id: 'roles', label: '角色', desc: '系统角色与自定义角色', icon: Bot, accent: T.purple, stat: `${roles.length} 个` },
    { id: 'memory', label: '记忆', desc: '检索、导出与清理', icon: Brain, accent: T.blue, stat: `${memories.length} 条` },
    { id: 'diagnostics', label: '诊断', desc: '日志、搜索与能力检查', icon: Gauge, accent: T.red, stat: `${logs.length} 条` },
  ];

  const activeModuleMeta = modules.find((module) => module.id === activeModule) || modules[0];

  const view: SettingsViewModel = {
    activeConfig,
    activeConfigId,
    activeModule,
    apiConfigs,
    apiKey,
    base,
    customRoles,
    discoveredModels,
    editingRole,
    filteredMemories,
    filteredProjectModels,
    importableModels,
    logSummary,
    logs,
    memories,
    memoryQuery,
    models,
    providerConfig,
    projectModelSearch,
    projectModels,
    roles,
    selectedImports,
    tavilyApiKey,
    tavilyApiKeySet,
    themeMode,
    themeOptions,
  };

  const actions: SettingsActions = {
    addConfig,
    addLog,
    applyConfig,
    deleteConfig,
    exportMemoriesToFile,
    importSelectedModels,
    onClearLogs,
    onClearMemories,
    onDeleteMemory,
    removeProjectModel,
    saveCustomRole,
    setActiveConfigName,
    setActiveModule,
    setApiConfigs,
    setApiKey,
    setBase,
    setConnectionApiKey,
    setConnectionBase,
    setCustomRoles,
    setEditingRole,
    setMemoryQuery,
    setModels,
    setProjectModelSearch,
    setProviderAuthType,
    setProviderCustomHeaderName,
    setProviderCustomPrefix,
    setProviderImageTimeoutMs,
    setProviderModelsEndpoint,
    setSelectedImports,
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
    defaults: <DefaultsSection actions={actions} view={view} />,
    roles: <RolesSection actions={actions} view={view} />,
    memory: <MemorySection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
    diagnostics: <DiagnosticsSection T={T as unknown as Record<string, string>} actions={actions} view={view} />,
  }[activeModule];

  return (
    <div className="workflow-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div className="workflow-toolbar glass" style={{ marginBottom: 0 }}>
        <div className="workflow-toolbar__frame" style={{ alignItems: 'stretch', flexWrap: 'wrap', rowGap: 12 }}>
          <div className="workflow-toolbar__identity" style={{ minWidth: 220, alignItems: 'flex-start' }}>
            <div className="workflow-toolbar__badge">
              <Layers3 size={20} />
            </div>
            <div>
              <div style={eyebrowStyle()}>Settings</div>
              <div className="workflow-toolbar__title" style={{ fontSize: 18 }}>工作室设置</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                管理连接、模型、角色、记忆与诊断。
              </div>
            </div>
          </div>

          <div className="workflow-toolbar__status" style={{ minWidth: 260, flex: 1, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>当前配置</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>{activeConfig?.name || '当前配置还没有名称'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={chipStyle(base ? T.green : T.orange)}>{base ? '已接入服务' : '待配置地址'}</span>
              <span style={chipStyle(models.length > 0 ? T.blue : undefined)}>{models.length} 已发现模型</span>
               <span style={chipStyle((tavilyApiKey || tavilyApiKeySet) ? T.purple : undefined)}>{(tavilyApiKey || tavilyApiKeySet) ? '搜索已启用' : '搜索未启用'}</span>
            </div>
          </div>

        </div>
      </div>

      <div className="workflow-shell" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 320px', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        <aside style={{ ...panelStyle(), padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div>
            <div style={eyebrowStyle()}>Modules</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>模块导航</h2>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>按模块查看和调整当前工作室配置。</p>
          </div>

          <div className="flex-col" style={{ gap: 10 }}>
            {modules.map((module) => {
              const Icon = module.icon;
              const active = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module.id)}
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
                      <div style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${module.accent}20`, color: module.accent }}>
                        <Icon size={16} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{module.label}</div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)', marginTop: 3, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{module.desc}</div>
                      </div>
                    </div>
                    <span style={{ ...chipStyle(active ? module.accent : undefined), padding: '5px 8px' }}>{module.stat}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Snapshot</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{activeConfig?.name || '当前配置还没有名称'}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              {base || '接口地址还未配置'}
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
            <div style={eyebrowStyle()}>Live Insight</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 8 }}>系统侧写</h2>
            <div className="flex-col" style={{ gap: 12, marginTop: 14 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>模型资产</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{projectModels.length}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>已纳入项目模型库</div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>视觉模式</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{THEME_LABELS[themeMode]}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>当前界面正在使用的色彩模式</div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>能力开关</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={chipStyle(models.length > 0 ? T.blue : undefined)}>模型发现</span>
                   <span style={chipStyle((tavilyApiKey || tavilyApiKeySet) ? T.purple : undefined)}>网页搜索</span>
                  <span style={chipStyle(customRoles.length > 0 ? T.green : undefined)}>自定义角色</span>
                </div>
              </div>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>最近日志摘要</div>
                <div className="flex-col" style={{ gap: 8 }}>
                  {logSummary.length === 0 && (
                    <EmptyStateCard
                      title="还没有最近日志"
                      body="连接测试、模型导入、搜索校验等操作完成后，这里会显示最近几条系统反馈。"
                      action="可以先执行一次连接测试或搜索测试，确认当前配置是否可用。"
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
