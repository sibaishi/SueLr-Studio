import type { StreamMode, StudioSettingsPayload, WorkflowConcurrencySettingsPayload } from '@/features/settings';
import type { StudioSettingsState } from '@/features/settings';
import {
  checkSettingsServer,
  loadRuntimeCapabilities,
  loadStudioSettings,
  saveStudioSettings,
  testSettingsConnection,
} from '@/features/settings';
import { debouncedSaveJSON } from '@/shared/runtime';
import type { RuntimeCapabilities } from '@/shared/runtime';
import type { AgentRole, ApiConfig, Tab, ThemeMode } from '@/shared/types';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseAppBootstrapParams = {
  hydratedRef: MutableRefObject<boolean>;
  setSidebarCollapsed: (value: boolean) => void;
  setTab: (tab: Tab) => void;
  setThemeMode: (theme: ThemeMode) => void;
  settings: StudioSettingsState;
  sidebarCollapsed: boolean;
  tab: Tab;
  themeMode: ThemeMode;
};

function mapLegacyStreamingMode(value: unknown): StreamMode {
  return value === 'real' || value === 'stream' ? 'stream' : 'non-stream';
}

function buildStudioSettingsPayload(params: {
  activeConfigId: string;
  apiConfigs: ApiConfig[];
  chatStreamingMode: StreamMode;
  customRoles: AgentRole[];
  imageStreamingMode: StreamMode;
  sidebarCollapsed: boolean;
  tab: Tab;
  workflowConcurrency: WorkflowConcurrencySettingsPayload;
  themeMode: ThemeMode;
  videoStreamingMode: StreamMode;
}): StudioSettingsPayload {
  return {
    ui: {
      theme: params.themeMode,
      customRoles: params.customRoles,
      lastTab: params.tab,
      sidebarCollapsed: params.sidebarCollapsed,
      chatStreamingMode: params.chatStreamingMode,
      imageStreamingMode: params.imageStreamingMode,
      videoStreamingMode: params.videoStreamingMode,
    },
    runtime: {
      configs: params.apiConfigs,
      activeConfigId: params.activeConfigId,
    },
    workflow: {
      concurrency: params.workflowConcurrency,
    },
  };
}

export function useAppBootstrap(params: UseAppBootstrapParams) {
  const { settings } = params;
  const [splashFading, setSplashFading] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapMode, setBootstrapMode] = useState<'pending' | 'server' | 'browser-only' | 'blocked'>('pending');
  const bootstrappedRef = useRef(false);
  const activeHydrationUserRef = useRef<string | null>(null);
  const activeRuntimeRef = useRef<RuntimeCapabilities | null>(null);

  const finishSplash = useCallback(() => {
    setSplashFading(true);
    window.setTimeout(() => setSplashHidden(true), 500);
  }, []);

  const applyActiveConfig = useCallback(
    async (cfgs: ApiConfig[], activeId: string) => {
      const config = cfgs.find((item) => item.id === activeId);
      if (!config) return;

      params.settings.setBase(config.base);
      params.settings.setApiKey(config.apiKey);
      params.settings.setModels(config.models);

      if (config.models.length === 0 && config.base && (config.apiKey || config.apiKeySet)) {
        try {
          const result = await testSettingsConnection(
            'use-stored',
            config.base,
            config.id,
            config.providerConfig as Record<string, unknown> | undefined,
          );
          if (!result.success) throw new Error(result.error || '模型获取失败');
          const nextModels = result.models;
          if (nextModels.length > 0) {
            params.settings.setModels(nextModels);
            params.settings.setApiConfigs((prev) =>
              prev.map((item) => (item.id === config.id ? { ...item, models: nextModels } : item)),
            );
          }
          params.settings.addLog('success', `启动时自动加载 ${nextModels.length} 个模型`);
        } catch {
          // Ignore auto-discovery failures during bootstrap.
        }
      } else if (config.models.length > 0) {
        params.settings.addLog('success', `已加载 ${config.models.length} 个缓存模型`);
      }
    },
    [params.settings],
  );

  const hydrateWorkspace = useCallback(
    async (runtime: RuntimeCapabilities | null) => {
      if (!runtime) {
        params.hydratedRef.current = false;
        activeHydrationUserRef.current = null;
        setBootstrapError('无法确认当前登录状态，请刷新页面后重试。');
        setBootstrapMode('blocked');
        finishSplash();
        return runtime;
      }

      if (runtime?.auth?.required && !runtime.auth.user) {
        params.hydratedRef.current = false;
        activeHydrationUserRef.current = null;
        setBootstrapError(null);
        setBootstrapMode('server');
        finishSplash();
        return runtime;
      }

      let cfgs = settings.apiConfigs;
      let activeId = settings.activeConfigId;
      const loadedSettings = await loadStudioSettings().catch(() => null);

      if (loadedSettings) {
        if (loadedSettings.runtime?.configs?.length) {
          cfgs = loadedSettings.runtime.configs;
          params.settings.setApiConfigs(cfgs);
        }
        if (loadedSettings.runtime?.activeConfigId) {
          activeId = loadedSettings.runtime.activeConfigId;
          params.settings.setActiveConfigId(activeId);
        }
        if (loadedSettings.ui?.theme) params.setThemeMode(loadedSettings.ui.theme);
        if (Array.isArray(loadedSettings.ui?.customRoles) && loadedSettings.ui.customRoles.length > 0) {
          void params.settings.setCustomRoles(loadedSettings.ui.customRoles);
        }
        if (loadedSettings.workflow?.concurrency) {
          params.settings.setWorkflowConcurrency(loadedSettings.workflow.concurrency);
        }
        if (loadedSettings.ui?.lastTab) params.setTab(loadedSettings.ui.lastTab as Tab);
        if (typeof loadedSettings.ui?.sidebarCollapsed === 'boolean') {
          params.setSidebarCollapsed(loadedSettings.ui.sidebarCollapsed);
        }
        if (loadedSettings.ui?.chatStreamingMode) {
          params.settings.setChatStreamingMode(mapLegacyStreamingMode(loadedSettings.ui.chatStreamingMode));
        }
        if (loadedSettings.ui?.imageStreamingMode) {
          params.settings.setImageStreamingMode(mapLegacyStreamingMode(loadedSettings.ui.imageStreamingMode));
        }
        if (loadedSettings.ui?.videoStreamingMode) {
          params.settings.setVideoStreamingMode(mapLegacyStreamingMode(loadedSettings.ui.videoStreamingMode));
        }
        params.settings.addLog('success', '已从本地存储恢复设置');
      }

      await applyActiveConfig(cfgs, activeId);
      params.hydratedRef.current = true;
      activeHydrationUserRef.current = runtime?.auth?.required ? runtime.auth.user?.id || null : 'single-user';
      setBootstrapError(null);
      setBootstrapMode('server');
      finishSplash();
      return runtime;
    },
    [
      applyActiveConfig,
      finishSplash,
      params,
      settings.activeConfigId,
      settings.apiConfigs,
    ],
  );

  useEffect(() => {
    if (!params.hydratedRef.current) return;
    if (runtimeCapabilities?.auth.required && !runtimeCapabilities.auth.user) return;

    const snapshot = buildStudioSettingsPayload({
      activeConfigId: settings.activeConfigId,
      apiConfigs: settings.apiConfigs,
      chatStreamingMode: settings.chatStreamingMode,
      customRoles: settings.customRoles,
      imageStreamingMode: settings.imageStreamingMode,
      sidebarCollapsed: params.sidebarCollapsed,
      tab: params.tab,
      workflowConcurrency: settings.workflowConcurrency,
      themeMode: params.themeMode,
      videoStreamingMode: settings.videoStreamingMode,
    });

    debouncedSaveJSON('ai_configs', settings.apiConfigs);
    debouncedSaveJSON('ai_active_config', settings.activeConfigId);
    debouncedSaveJSON('ai_theme', params.themeMode);
    debouncedSaveJSON('ai_custom_roles', settings.customRoles);
    debouncedSaveJSON('ai_tab', params.tab);
    debouncedSaveJSON('ai_sidebar_collapsed', params.sidebarCollapsed);
    debouncedSaveJSON('ai_chat_streaming_mode', settings.chatStreamingMode);
    debouncedSaveJSON('ai_image_streaming_mode', settings.imageStreamingMode);
    debouncedSaveJSON('ai_video_streaming_mode', settings.videoStreamingMode);

    void saveStudioSettings(snapshot);
  }, [
    params.hydratedRef,
    params.sidebarCollapsed,
    params.tab,
    params.themeMode,
    runtimeCapabilities?.auth.required,
    runtimeCapabilities?.auth.user,
    settings.activeConfigId,
    settings.apiConfigs,
    settings.chatStreamingMode,
    settings.customRoles,
    settings.imageStreamingMode,
    settings.videoStreamingMode,
    settings.workflowConcurrency,
  ]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const init = async () => {
      const serverOk = await checkSettingsServer().catch(() => false);

      if (serverOk) {
        const runtime = await loadRuntimeCapabilities().catch(() => null);
        activeRuntimeRef.current = runtime;
        setRuntimeCapabilities(runtime);
        settings.addLog('success', '本地存储服务已连接');
        await hydrateWorkspace(runtime);
        return;
      }

      settings.addLog('info', '本地存储服务未启动，数据仅保存在浏览器中');
      if (!import.meta.env.DEV) {
        params.hydratedRef.current = false;
        activeHydrationUserRef.current = null;
        setBootstrapError('无法连接服务端，已阻止进入工作区。');
        setBootstrapMode('blocked');
        finishSplash();
        return;
      }

      params.hydratedRef.current = true;
      activeHydrationUserRef.current = 'browser-only';
      setBootstrapError(null);
      setBootstrapMode('browser-only');
      finishSplash();
    };

    void init();
  }, [finishSplash, hydrateWorkspace, params.hydratedRef, settings]);

  const refreshRuntimeCapabilities = useCallback(async () => {
    const runtime = await loadRuntimeCapabilities().catch(() => null);
    activeRuntimeRef.current = runtime;
    setRuntimeCapabilities(runtime);
    if (!runtime && bootstrapMode !== 'browser-only') {
      params.hydratedRef.current = false;
      activeHydrationUserRef.current = null;
      setBootstrapError('无法确认当前登录状态，请刷新页面后重试。');
      setBootstrapMode('blocked');
    } else if (runtime) {
      setBootstrapError(null);
      setBootstrapMode('server');
    }
    return runtime;
  }, [bootstrapMode, params.hydratedRef]);

  const authenticateAndHydrate = useCallback(async () => {
    params.hydratedRef.current = false;
    const runtime = await refreshRuntimeCapabilities();
    await hydrateWorkspace(runtime);
    return runtime;
  }, [hydrateWorkspace, params.hydratedRef, refreshRuntimeCapabilities]);

  const clearAuthenticatedHydration = useCallback(() => {
    params.hydratedRef.current = false;
    activeHydrationUserRef.current = null;
  }, [params.hydratedRef]);

  return {
    authenticateAndHydrate,
    bootstrapError,
    bootstrapMode,
    clearAuthenticatedHydration,
    refreshRuntimeCapabilities,
    runtimeCapabilities,
    splashFading,
    splashHidden,
  };
}
