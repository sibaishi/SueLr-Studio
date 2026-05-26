import { normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import { DEFAULT_PROVIDER_CONFIG } from '@/shared/providers';
import type { ApiConfig, ModelInfo, ProjectModel, ProviderConfig } from '@/shared/types';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo } from 'react';
import { testSettingsConnection } from './api';

type SettingsPanelControllerParams = {
  activeConfigId: string;
  apiConfigs: ApiConfig[];
  apiKey: string;
  base: string;
  addLog: (level: string, message: string) => void;
  setApiConfigs: Dispatch<SetStateAction<ApiConfig[]>>;
  setApiKey: (value: string) => void;
  setBase: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
};

export function useSettingsPanelController({
  activeConfigId,
  apiConfigs,
  apiKey,
  base,
  addLog,
  setApiConfigs,
  setApiKey,
  setBase,
  setModels,
}: SettingsPanelControllerParams) {
  const activeConfig = useMemo(
    () => apiConfigs.find((config) => config.id === activeConfigId),
    [activeConfigId, apiConfigs],
  );

  const providerConfig = useMemo<ProviderConfig>(
    () => ({
      ...DEFAULT_PROVIDER_CONFIG,
      ...activeConfig?.providerConfig,
      authType: activeConfig?.providerConfig?.authType ?? DEFAULT_PROVIDER_CONFIG.authType,
      videoMode: activeConfig?.providerConfig?.videoMode ?? DEFAULT_PROVIDER_CONFIG.videoMode,
      videoEndpoint: activeConfig?.providerConfig?.videoEndpoint ?? DEFAULT_PROVIDER_CONFIG.videoEndpoint,
      imageEndpoint: activeConfig?.providerConfig?.imageEndpoint ?? DEFAULT_PROVIDER_CONFIG.imageEndpoint,
      imageEditEndpoint: activeConfig?.providerConfig?.imageEditEndpoint ?? DEFAULT_PROVIDER_CONFIG.imageEditEndpoint,
      imageTimeoutMs: activeConfig?.providerConfig?.imageTimeoutMs ?? DEFAULT_PROVIDER_CONFIG.imageTimeoutMs ?? 300000,
      chatEndpoint: activeConfig?.providerConfig?.chatEndpoint ?? DEFAULT_PROVIDER_CONFIG.chatEndpoint,
      modelsEndpoint:
        activeConfig?.providerConfig?.modelsEndpoint ?? DEFAULT_PROVIDER_CONFIG.modelsEndpoint ?? '/v1/models',
      customHeaderName:
        activeConfig?.providerConfig?.customHeaderName ?? DEFAULT_PROVIDER_CONFIG.customHeaderName ?? '',
      customPrefix: activeConfig?.providerConfig?.customPrefix ?? DEFAULT_PROVIDER_CONFIG.customPrefix ?? '',
    }),
    [activeConfig?.providerConfig],
  );

  const updateActiveConfig = useCallback(
    (patch: Partial<ApiConfig>) => {
      if (!activeConfigId) return;
      setApiConfigs((prev) => prev.map((config) => (config.id === activeConfigId ? { ...config, ...patch } : config)));
    },
    [activeConfigId, setApiConfigs],
  );

  const updateProviderConfig = useCallback(
    (patch: Partial<ProviderConfig>) => {
      updateActiveConfig({
        providerConfig: {
          ...(activeConfig?.providerConfig ?? DEFAULT_PROVIDER_CONFIG),
          ...patch,
        },
      });
    },
    [activeConfig?.providerConfig, updateActiveConfig],
  );

  const setActiveConfigName = useCallback(
    (value: string) => {
      updateActiveConfig({ name: value });
    },
    [updateActiveConfig],
  );

  const setConnectionBase = useCallback(
    (value: string) => {
      setBase(value);
      updateActiveConfig({ base: value });
    },
    [setBase, updateActiveConfig],
  );

  const setConnectionApiKey = useCallback(
    (value: string) => {
      setApiKey(value);
      updateActiveConfig({ apiKey: value });
    },
    [setApiKey, updateActiveConfig],
  );

  const setProviderAuthType = useCallback(
    (value: ProviderConfig['authType']) => {
      updateProviderConfig({ authType: value });
    },
    [updateProviderConfig],
  );

  const setProviderModelsEndpoint = useCallback(
    (value: string) => {
      updateProviderConfig({ modelsEndpoint: value });
    },
    [updateProviderConfig],
  );

  const setProviderCustomHeaderName = useCallback(
    (value: string) => {
      updateProviderConfig({ customHeaderName: value });
    },
    [updateProviderConfig],
  );

  const setProviderCustomPrefix = useCallback(
    (value: string) => {
      updateProviderConfig({ customPrefix: value });
    },
    [updateProviderConfig],
  );

  const setProviderImageTimeoutMs = useCallback(
    (value: string) => {
      updateProviderConfig({
        imageTimeoutMs: Math.max(1000, Number(value) || DEFAULT_PROVIDER_CONFIG.imageTimeoutMs || 300000),
      });
    },
    [updateProviderConfig],
  );

  const setProjectModels = useCallback(
    (nextModels: ProjectModel[]) => {
      updateActiveConfig({ projectModels: normalizeProjectModels(nextModels) });
    },
    [updateActiveConfig],
  );

  const updateProjectModel = useCallback(
    (projectModels: ProjectModel[], modelId: string, patch: Partial<ProjectModel>) => {
      setProjectModels(
        projectModels.map((model) =>
          model.modelId === modelId ? { ...model, ...patch, updatedAt: Date.now() } : model,
        ),
      );
    },
    [setProjectModels],
  );

  const testConnectionAndSyncModels = useCallback(async () => {
    addLog('info', `测试连接: ${base}`);
    try {
      const result = await testSettingsConnection(
        apiKey || 'use-stored',
        base,
        activeConfig?.id,
        activeConfig?.providerConfig as Record<string, unknown> | undefined,
      );
      if (!result.success) throw new Error(result.error || '模型获取失败');
      const nextModels = result.models || [];
      setModels(nextModels);
      updateActiveConfig({ models: nextModels });
      addLog('success', `连接成功，发现 ${nextModels.length} 个模型`);
      return nextModels;
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
      return [];
    }
  }, [activeConfig?.providerConfig, addLog, apiKey, base, setModels, updateActiveConfig]);

  return {
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
  };
}
