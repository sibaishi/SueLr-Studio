import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRESET_ROLES } from '@/lib/constants';
import type { AgentRole, ApiConfig, LogEntry, ModelInfo } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { ftime, gid, loadJSON } from '@/lib/utils';
import { groupConfiguredProjectModels, normalizeProjectModels } from '@/features/workflow/lib/projectModels';
import { isBackendAvailable } from '@/shared/api';
import { loadAgentProfiles, saveAgentProfiles, type AgentProfile } from '@/shared/api/agent';
import type { OutboundProxySettingsPayload, StreamMode, WorkflowConcurrencySettingsPayload } from './types';

const MAX_LOGS = 500;

export const mapLegacyStreamingMode = (value: unknown): StreamMode => (
  value === 'real' || value === 'stream' ? 'stream' : 'non-stream'
);

function getConfigLabel(config: ApiConfig, index: number) {
  return config.name?.trim() || config.base?.trim() || `API 配置 ${index + 1}`;
}

function buildConfiguredProjectModels(configs: ApiConfig[]): ModelInfo[] {
  return configs.flatMap((config, index) => {
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
    ];
  });
}

function defaultAgentProfiles() {
  return PRESET_ROLES.map(toAgentProfile).map((profile) => ({ ...profile, isCustom: false }));
}

function toLegacyRole(profile: AgentProfile): AgentRole {
  const enabledTools = Array.isArray(profile.enabledTools) ? profile.enabledTools : [];
  return {
    id: profile.id,
    name: profile.name,
    icon: profile.icon || 'bot',
    systemPrompt: profile.instruction || '',
    tools: enabledTools
      .map((tool) => {
        if (tool === 'image.generate' || tool === 'generate_image') return 'generate_image';
        if (tool === 'video.generate' || tool === 'generate_video' || tool === 'video_generate') return 'generate_video';
        if (tool === 'web.search' || tool === 'web_search') return 'web_search';
        if (tool === 'workflow.execute' || tool === 'workflow_execute') return null;
        return null;
      })
      .filter((tool): tool is AgentRole['tools'][number] => Boolean(tool)),
    isCustom: Boolean(profile.isCustom),
  };
}

function toAgentProfile(role: AgentRole): AgentProfile {
  return {
    id: role.id,
    name: role.name,
    icon: role.icon,
    description: '',
    instruction: role.systemPrompt,
    enabledTools: [
      ...(role.tools.includes('web_search') ? ['web_search'] : []),
      ...(role.tools.includes('generate_image') ? ['generate_image'] : []),
      ...(role.tools.includes('generate_video') ? ['video_generate'] : []),
      'workflow_execute',
      'search_memory',
      'get_current_time',
    ],
    defaultModel: '',
    behavior: {
      responseStyle: 'balanced',
      memoryMode: 'auto',
    },
    isCustom: Boolean(role.isCustom),
  };
}

export function useStudioSettingsState() {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(loadJSON('ai_configs', []));
  const [activeConfigId, setActiveConfigId] = useState(loadJSON('ai_active_config', ''));
  const [base, setBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>(() => {
    const localRoles = loadJSON<AgentRole[]>('ai_custom_roles', []);
    return [...defaultAgentProfiles(), ...localRoles.map((role) => ({ ...toAgentProfile(role), isCustom: true }))];
  });
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [tavilyApiKeySet, setTavilyApiKeySet] = useState(false);
  const [outboundProxy, setOutboundProxy] = useState<OutboundProxySettingsPayload>({
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  });
  const [workflowConcurrency, setWorkflowConcurrency] = useState<WorkflowConcurrencySettingsPayload>({
    enabled: false,
    maxConcurrency: 5,
  });
  const [chatStreamingMode, setChatStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_chat_streaming_mode', loadJSON('ai_streaming_mode', 'non-stream'))));
  const [imageStreamingMode, setImageStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_image_streaming_mode', 'stream')));
  const [videoStreamingMode, setVideoStreamingMode] = useState<StreamMode>(() => mapLegacyStreamingMode(loadJSON('ai_video_streaming_mode', 'stream')));

  const customRoles = useMemo(
    () => agentProfiles.filter((profile) => profile.isCustom).map(toLegacyRole),
    [agentProfiles],
  );
  const roles = useMemo(
    () => agentProfiles.map(toLegacyRole),
    [agentProfiles],
  );
  const customAgentProfiles = useMemo(
    () => agentProfiles.filter((profile) => profile.isCustom),
    [agentProfiles],
  );

  const activeConfig = useMemo(() => apiConfigs.find((item) => item.id === activeConfigId), [apiConfigs, activeConfigId]);

  const providerConfig = useMemo<ProviderConfig | undefined>(() => activeConfig?.providerConfig, [activeConfig?.providerConfig]);

  const configuredProjectModels = useMemo(() => buildConfiguredProjectModels(apiConfigs), [apiConfigs]);

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
      const nextActiveId = id === activeConfigId ? next[0]?.id : null;
      if (nextActiveId) setTimeout(() => applyConfig(nextActiveId), 0);
      return next;
    });
  }, [activeConfigId, applyConfig]);

  const addLog = useCallback((level: string, msg: string) => {
    const time = ftime(Date.now());
    setLogs((prev) => [{ time, level, msg }, ...prev].slice(0, MAX_LOGS));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    let cancelled = false;

    const syncProfiles = async () => {
      if (!isBackendAvailable()) return;
      try {
        const profiles = await loadAgentProfiles();
        if (cancelled) return;
        setAgentProfiles(profiles);
      } catch {
        // Keep local fallback roles when backend sync fails.
      }
    };

    void syncProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistAgentProfiles = useCallback(async (updater: AgentProfile[] | ((prev: AgentProfile[]) => AgentProfile[])) => {
    let nextProfiles: AgentProfile[] = [];
    setAgentProfiles((prev) => {
      nextProfiles = typeof updater === 'function' ? updater(prev) : updater;
      return nextProfiles;
    });

    if (!isBackendAvailable()) return;

    try {
      await saveAgentProfiles(nextProfiles);
    } catch {
      // Keep optimistic UI state even if backend persistence fails.
    }
  }, []);

  const upsertAgentProfile = useCallback(async (profile: AgentProfile) => {
    await persistAgentProfiles((prev) => {
      const next = prev.some((item) => item.id === profile.id)
        ? prev.map((item) => (item.id === profile.id ? profile : item))
        : [...prev, profile];
      return next;
    });
  }, [persistAgentProfiles]);

  const deleteAgentProfile = useCallback(async (profileId: string) => {
    await persistAgentProfiles((prev) => prev.filter((item) => item.id !== profileId));
  }, [persistAgentProfiles]);

  const setCustomRoles = useCallback(async (updater: AgentRole[] | ((prev: AgentRole[]) => AgentRole[])) => {
    await persistAgentProfiles((prev) => {
      const currentCustomRoles = prev.filter((profile) => profile.isCustom).map(toLegacyRole);
      const nextRoles = typeof updater === 'function' ? updater(currentCustomRoles) : updater;
      return [
        ...prev.filter((profile) => !profile.isCustom),
        ...nextRoles.map((role) => ({ ...toAgentProfile(role), isCustom: true })),
      ];
    });
  }, [persistAgentProfiles]);

  return {
    activeConfig,
    activeConfigId,
    addLog,
    addNewConfig,
    agentProfiles,
    apiConfigs,
    apiKey,
    applyConfig,
    base,
    chatStreamingMode,
    clearLogs,
    configuredProjectModels,
    customAgentProfiles,
    customRoles,
    deleteAgentProfile,
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
    setWorkflowConcurrency,
    setTavilyApiKey,
    setTavilyApiKeySet,
    setVideoStreamingMode,
    tavilyApiKey,
    tavilyApiKeySet,
    upsertAgentProfile,
    videoStreamingMode,
    workflowConcurrency,
  };
}

export type StudioSettingsState = ReturnType<typeof useStudioSettingsState>;
