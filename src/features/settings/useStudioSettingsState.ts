import { useCallback, useMemo, useState } from 'react';
import { PRESET_ROLES } from '@/lib/constants';
import type { AgentRole, ApiConfig, LogEntry, ModelInfo } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { ftime, gid, loadJSON } from '@/lib/utils';
import { groupConfiguredProjectModels, normalizeProjectModels } from '@/features/workflow/lib/projectModels';
import type { OutboundProxySettingsPayload, StreamMode } from './types';

export const mapLegacyStreamingMode = (value: unknown): StreamMode => (
  value === 'real' || value === 'stream' ? 'stream' : 'non-stream'
);

export function useStudioSettingsState() {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(loadJSON('ai_configs', []));
  const [activeConfigId, setActiveConfigId] = useState(loadJSON('ai_active_config', ''));
  const [base, setBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [customRoles, setCustomRoles] = useState<AgentRole[]>(loadJSON('ai_custom_roles', []));
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [tavilyApiKeySet, setTavilyApiKeySet] = useState(false);
  const [outboundProxy, setOutboundProxy] = useState<OutboundProxySettingsPayload>({
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  });
  const [chatStreamingMode, setChatStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_chat_streaming_mode', loadJSON('ai_streaming_mode', 'non-stream'))));
  const [imageStreamingMode, setImageStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_image_streaming_mode', 'stream')));
  const [videoStreamingMode, setVideoStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_video_streaming_mode', 'stream')));

  const roles = useMemo(() => [...PRESET_ROLES, ...customRoles], [customRoles]);

  const activeConfig = useMemo(() => apiConfigs.find((item) => item.id === activeConfigId), [apiConfigs, activeConfigId]);

  const providerConfig = useMemo<ProviderConfig | undefined>(() => activeConfig?.providerConfig, [activeConfig?.providerConfig]);

  const configuredProjectModels = useMemo(() => {
    const projectModels = normalizeProjectModels(activeConfig?.projectModels || []);
    const grouped = groupConfiguredProjectModels(projectModels);
    return [
      ...grouped.chat.map((id) => ({ id, cat: 'chat' as const })),
      ...grouped.image.map((id) => ({ id, cat: 'image' as const })),
      ...grouped.video.map((id) => ({ id, cat: 'video' as const })),
    ];
  }, [activeConfig?.projectModels]);

  const applyConfig = useCallback((id: string) => {
    const config = apiConfigs.find((item) => item.id === id);
    if (!config) return;
    setBase(config.base);
    setApiKey(config.apiKey);
    setModels(config.models);
    setActiveConfigId(id);
  }, [apiConfigs]);

  const addNewConfig = useCallback(() => {
    const id = gid();
    setApiConfigs((prev) => [...prev, { id, name: '', base: '', apiKey: '', models: [] }]);
    return id;
  }, []);

  const deleteConfig = useCallback((id: string) => {
    setApiConfigs((prev) => {
      const next = prev.filter((config) => config.id !== id);
      if (id === activeConfigId && next.length > 0) setTimeout(() => applyConfig(next[0].id), 0);
      return next;
    });
  }, [activeConfigId, applyConfig]);

  const addLog = useCallback((level: string, msg: string) => {
    const time = ftime(Date.now());
    setLogs((prev) => [{ time, level, msg }, ...prev].slice(0, 500));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    activeConfig,
    activeConfigId,
    addLog,
    addNewConfig,
    apiConfigs,
    apiKey,
    applyConfig,
    base,
    chatStreamingMode,
    clearLogs,
    configuredProjectModels,
    customRoles,
    deleteConfig,
    imageStreamingMode,
    logs,
    models,
    outboundProxy,
    providerConfig,
    roles,
    setActiveConfigId,
    setApiConfigs,
    setApiKey,
    setBase,
    setChatStreamingMode,
    setCustomRoles,
    setImageStreamingMode,
    setModels,
    setOutboundProxy,
    setTavilyApiKey,
    setTavilyApiKeySet,
    setVideoStreamingMode,
    tavilyApiKey,
    tavilyApiKeySet,
    videoStreamingMode,
  };
}

export type StudioSettingsState = ReturnType<typeof useStudioSettingsState>;
