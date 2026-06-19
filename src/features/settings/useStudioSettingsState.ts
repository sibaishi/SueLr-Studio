import { groupConfiguredProjectModels, normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import type { ProviderConfig } from '@/shared/providers';
import { debouncedSaveJSON, ftime, gid, loadJSON } from '@/shared/runtime';
import type { ApiConfig, LogEntry, ModelInfo } from '@/shared/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StreamMode, WorkflowConcurrencySettingsPayload } from './types';

const MAX_LOGS = 500;
const DEFAULT_WORKFLOW_CONCURRENCY: WorkflowConcurrencySettingsPayload = {
  enabled: false,
  maxConcurrency: 5,
};

export const mapLegacyStreamingMode = (value: unknown): StreamMode =>
  value === 'real' || value === 'stream' ? 'stream' : 'non-stream';

function getConfigLabel(config: ApiConfig, index: number) {
  return config.name?.trim() || config.base?.trim() || `API 配置 ${index + 1}`;
}

function buildConfiguredProjectModels(configs: ApiConfig[]): ModelInfo[] {
  return configs.filter((config) => config.enabled !== false).flatMap((config, index) => {
    const projectModels = normalizeProjectModels(config.projectModels || []);
    const grouped = groupConfiguredProjectModels(projectModels);
    const configName = getConfigLabel(config, index);
    const decorate = (cat: ModelInfo['cat']) => (option: { modelId: string }) => ({
      id: `${config.id}::${option.modelId}`,
      modelId: option.modelId,
      cat,
      configId: config.id,
      configName,
    });

    return [
      ...grouped.chat.map(decorate('chat')),
      ...grouped.image.map(decorate('image')),
      ...grouped.video.map(decorate('video')),
      ...grouped.midjourney.map(decorate('midjourney')),
    ];
  });
}

export function useStudioSettingsState() {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(loadJSON('ai_configs', []));
  const [activeConfigId, setActiveConfigId] = useState(loadJSON('ai_active_config', ''));
  const [base, setBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [workflowConcurrency, setWorkflowConcurrency] =
    useState<WorkflowConcurrencySettingsPayload>(DEFAULT_WORKFLOW_CONCURRENCY);
  const [imageStreamingMode, setImageStreamingMode] = useState<StreamMode>(() =>
    mapLegacyStreamingMode(loadJSON('ai_image_streaming_mode', 'stream')),
  );
  const [videoStreamingMode, setVideoStreamingMode] = useState<StreamMode>(() =>
    mapLegacyStreamingMode(loadJSON('ai_video_streaming_mode', 'stream')),
  );

  const activeConfig = useMemo(
    () => apiConfigs.find((item) => item.id === activeConfigId),
    [apiConfigs, activeConfigId],
  );

  const providerConfig = useMemo<ProviderConfig | undefined>(
    () => activeConfig?.providerConfig,
    [activeConfig?.providerConfig],
  );

  const configuredProjectModels = useMemo(() => buildConfiguredProjectModels(apiConfigs), [apiConfigs]);

  const applyConfig = useCallback(
    (id: string) => {
      const config = apiConfigs.find((item) => item.id === id);
      if (!config) return;
      setBase(config.base);
      setApiKey(config.apiKey);
      setModels(config.models);
      setActiveConfigId(id);
    },
    [apiConfigs],
  );

  const addNewConfig = useCallback(() => {
    const id = gid();
    setApiConfigs((prev) => [...prev, { id, name: '', base: '', apiKey: '', models: [], enabled: true }]);
    return id;
  }, []);

  const toggleConfigEnabled = useCallback((id: string) => {
    setApiConfigs((prev) => prev.map((config) => (config.id === id ? { ...config, enabled: !(config.enabled !== false) } : config)));
  }, []);

  const deleteConfig = useCallback(
    (id: string) => {
      setApiConfigs((prev) => {
        const next = prev.filter((config) => config.id !== id);
        const nextActiveId = id === activeConfigId ? next[0]?.id : null;
        if (nextActiveId) setTimeout(() => applyConfig(nextActiveId), 0);
        return next;
      });
    },
    [activeConfigId, applyConfig],
  );

  const addLog = useCallback((level: string, msg: string) => {
    const time = ftime(Date.now());
    setLogs((prev) => [{ time, level, msg }, ...prev].slice(0, MAX_LOGS));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    debouncedSaveJSON('ai_configs', apiConfigs);
  }, [apiConfigs]);

  const resetUserSettings = useCallback(() => {
    setApiConfigs([]);
    setActiveConfigId('');
    setBase('');
    setApiKey('');
    setModels([]);
    setWorkflowConcurrency(DEFAULT_WORKFLOW_CONCURRENCY);
    setImageStreamingMode('stream');
    setVideoStreamingMode('stream');
  }, []);

  return {
    activeConfig,
    activeConfigId,
    addLog,
    addNewConfig,
    apiConfigs,
    apiKey,
    applyConfig,
    base,
    clearLogs,
    configuredProjectModels,
    deleteConfig,
    imageStreamingMode,
    logs,
    models,
    providerConfig,
    resetUserSettings,
    setActiveConfigId,
    setApiConfigs,
    setApiKey,
    setBase,
    setImageStreamingMode,
    setModels,
    setWorkflowConcurrency,
    setVideoStreamingMode,
    toggleConfigEnabled,
    videoStreamingMode,
    workflowConcurrency,
  };
}

export type StudioSettingsState = ReturnType<typeof useStudioSettingsState>;
