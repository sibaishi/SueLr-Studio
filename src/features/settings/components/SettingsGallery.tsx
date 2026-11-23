import type { ApiConfig, LogEntry, ModelInfo, ThemeMode } from '@/shared/types';
import { Button } from '@/ui/FormPrimitives';
import { useCallback, useRef, useState } from 'react';
import type { OutboundProxyRuntimePatch, StorageSettingsPayload } from '../types';
import { FirstRunOnboarding } from './FirstRunOnboarding';
import { SettingsModal } from './SettingsModal';
import { SettingsPanel } from './SettingsPanel';
import type { SettingsPanelServices } from './settingsPanelServices';

const discoveredModels: ModelInfo[] = [
  { id: 'demo-chat', cat: 'chat' },
  { id: 'demo-image', cat: 'image' },
];

function createGalleryServices(): SettingsPanelServices {
  const defaultRoot = '/演示/工作室数据';
  let storage: StorageSettingsPayload = {
    effectiveRoot: defaultRoot,
    defaultRoot,
    customRoot: '',
    source: 'default',
    restartRequired: false,
    canManagePath: true,
  };
  const defaults = { ...storage };
  let outboundProxy: OutboundProxyRuntimePatch['outboundProxy'] = {
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  };
  return {
    checkSettingsServer: async () => true,
    getRuntimeCapabilitiesSnapshot: () => ({
      mode: 'local-web',
      canSelectDirectory: true,
      canRestartBackend: true,
      hasEmbeddedShell: false,
    }),
    loadStorageSettings: async () => storage,
    loadStudioSettings: async () => ({
      ui: { theme: 'dark', imageStreamingMode: 'stream', videoStreamingMode: 'stream' },
      runtime: { configs: [], activeConfigId: '', outboundProxy },
    }),
    saveOutboundProxy: async (patch) => {
      outboundProxy = patch.outboundProxy;
    },
    pickStorageDirectory: async () => '/演示/自定义数据',
    saveStorageSettings: async (customRoot) => {
      storage = { ...defaults, customRoot, effectiveRoot: customRoot, source: 'custom', restartRequired: true };
      return storage;
    },
    resetStorageSettings: async () => {
      storage = { ...defaults, restartRequired: true };
      return storage;
    },
    loadClientDownloadDirectoryState: () => null,
    pickClientDownloadDirectory: async () => ({ supported: false, label: '' }),
    resetClientDownloadDirectory: async () => {},
    getBackendStatus: async () => ({ ok: true, version: 'demo' }),
    restartBackendRequest: async () => {
      storage = { ...storage, restartRequired: false };
      return { mode: 'watch' };
    },
    waitForBackendReady: async () => ({ ok: true, version: 'demo' }),
    testSettingsConnection: async (_apiKey, baseUrl) =>
      baseUrl.trim()
        ? { success: true, models: discoveredModels }
        : { success: false, models: [], error: '请填写演示接口地址。' },
  };
}

const initialConfig: ApiConfig = {
  id: 'demo',
  name: '演示配置',
  base: 'https://example.invalid/v1',
  apiKey: '',
  models: discoveredModels,
};

export function SettingsGallery({
  open,
  theme,
  onSetTheme,
  onClose,
}: {
  open: boolean;
  theme: 'dark' | 'light';
  onSetTheme: (theme: 'dark' | 'light') => void;
  onClose: () => void;
}) {
  const [services] = useState(createGalleryServices);
  const [configs, setConfigs] = useState([initialConfig]);
  const [activeId, setActiveId] = useState(initialConfig.id);
  const [base, setBase] = useState(initialConfig.base);
  const [apiKey, setApiKey] = useState(initialConfig.apiKey);
  const [models, setModels] = useState(initialConfig.models);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode | null>(null);
  const [edgeStyle, setEdgeStyle] = useState<'bezier' | 'smoothstep'>('bezier');
  const [concurrency, setConcurrency] = useState({ enabled: false, maxConcurrency: 5 });
  const serial = useRef(0);
  const addLog = useCallback((level: string, msg: string) => {
    setLogs((items) => [...items, { time: new Date().toLocaleTimeString(), level, msg }]);
  }, []);
  const applyConfig = (config: ApiConfig) => {
    setActiveId(config.id);
    setBase(config.base);
    setApiKey(config.apiKey || '');
    setModels(config.models);
  };

  if (!open) return null;

  return (
    <SettingsModal onClose={onClose} theme={theme}>
      <SettingsPanel
        services={services}
        apiConfigs={configs}
        setApiConfigs={setConfigs}
        activeConfigId={activeId}
        setActiveConfigId={setActiveId}
        applyConfig={(id) => {
          const config = configs.find((item) => item.id === id);
          if (config) applyConfig(config);
        }}
        addNewConfig={() => {
          const serialId = ++serial.current;
          const id = `demo-${serialId}`;
          setConfigs((items) => [...items, { id, name: `演示配置 ${serialId + 1}`, base: '', apiKey: '', models: [] }]);
          return id;
        }}
        deleteConfig={(id) => {
          const remaining = configs.filter((item) => item.id !== id);
          setConfigs(remaining);
          if (id === activeId && remaining.length > 0) applyConfig(remaining[0]);
        }}
        toggleConfigEnabled={(id) =>
          setConfigs((items) =>
            items.map((item) => (item.id === id ? { ...item, enabled: item.enabled === false } : item)),
          )
        }
        base={base}
        setBase={setBase}
        apiKey={apiKey}
        setApiKey={setApiKey}
        models={models}
        setModels={setModels}
        addLog={addLog}
        logs={logs}
        onClearLogs={() => setLogs([])}
        themeMode={themeMode === 'system' ? themeMode : theme}
        setThemeMode={(mode) => {
          setThemeMode(mode);
          onSetTheme(
            mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode,
          );
        }}
        edgeStyle={edgeStyle}
        setEdgeStyle={setEdgeStyle}
        workflowConcurrency={concurrency}
        setWorkflowConcurrency={setConcurrency}
        projectBusy={false}
      />
    </SettingsModal>
  );
}

/** Onboarding preview uses local services; it cannot read or change project settings. */
export function OnboardingGallery({ onClose }: { onClose: () => void }) {
  const services = useRef(createGalleryServices()).current;
  const [configs, setConfigs] = useState<ApiConfig[]>([{ ...initialConfig, apiKey: '', models: [] }]);
  const [activeId, setActiveId] = useState('demo');
  const [notice, setNotice] = useState('');
  return (
    <div className="studio-entry-preview">
      <Button small variant="secondary" className="studio-entry-preview__close" onClick={onClose}>
        关闭引导演示
      </Button>
      {notice && (
        <p className="studio-entry-preview__notice" role="status">
          {notice}
        </p>
      )}
      <FirstRunOnboarding
        services={services}
        activeConfigId={activeId}
        apiConfigs={configs}
        setApiConfigs={setConfigs}
        addNewConfig={() => 'demo'}
        applyConfig={setActiveId}
        setApiKey={() => {}}
        setBase={() => {}}
        setModels={() => {}}
        addLog={(_, text) => setNotice(text)}
        onComplete={(models) =>
          setNotice(models ? '演示：下一步在设置中手动导入模型。' : '演示：进入工作室，稍后配置。')
        }
      />
    </div>
  );
}
