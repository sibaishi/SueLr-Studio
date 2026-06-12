import { ProviderError, ValidationError } from '../../app/errors/index.ts';
import {
  categorizeLegacyModel,
  groupConfiguredProjectModels,
  migrateProjectModels,
  normalizeProjectModels,
} from '../../engine/helpers/projectModels.ts';
import { configureOutboundProxy, proxyAwareFetch } from '../../platform/http/proxy-aware-fetch.ts';
import { getProviderAdapter } from '../../platform/providers/index.ts';
import { parseProviderErrorResponse, toProviderError } from '../../platform/providers/provider-http.ts';
import { assertSafeProviderBaseUrl } from '../../platform/security/network-guards.ts';
import {
  LEGACY_PATHS,
  STORAGE_PATHS,
  clearStoredStorageRootOverride,
  ensureJsonFile,
  ensureStorageDirectories,
  getEffectiveStorageRootInfo,
  migrateLegacyStorageIfNeeded,
  readJsonFile,
  writeJsonFile,
  writeStoredStorageRootOverride,
} from '../../platform/storage/index.ts';
import { ensureScopedStorageDirectories, getScopedStoragePaths } from '../../platform/storage/scoped-storage.ts';
import { appConfigRepository } from '../app-config/app-config.repository.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { normalizeModelOverrides, sanitizeProviderConfig } from './settings.shared.ts';

const SETTINGS_VERSION = 1;

const DEFAULT_SETTINGS: DynamicValue = {
  version: SETTINGS_VERSION,
  migrations: {
    legacyImported: false,
  },
  ui: {
    theme: 'dark',
    sidebarCollapsed: false,
    lastTab: 'settings',
    customRoles: [],
    chatStreamingMode: 'non-stream',
    imageStreamingMode: 'stream',
    videoStreamingMode: 'stream',
  },
  runtime: {
    activeConfigId: '',
    tavilyApiKey: '',
    outboundProxy: {
      mode: 'system',
      httpProxy: '',
      httpsProxy: '',
      noProxy: '',
    },
    configs: [],
  },
  workflow: {
    snapToGrid: true,
    concurrency: {
      enabled: false,
      maxConcurrency: 5,
    },
  },
};

const DEFAULT_PROVIDER_CONFIG: DynamicValue = {
  authType: 'bearer',
  chatEndpoint: '/v1/chat/completions',
  modelsEndpoint: '/v1/models',
  imageEndpoint: '/v1/images/generations',
  imageEditEndpoint: '/v1/images/edits',
  imageTimeoutMs: 300000,
  videoEndpoint: '/v1/video/generations',
  modelOverrides: {},
};

function assertPlainObject(value: DynamicValue, message: string): asserts value is PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
}

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanOptionalString(value: DynamicValue, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function cleanSecretOverride(value: DynamicValue, maxLength = 5000) {
  const normalized = cleanOptionalString(value, maxLength);
  return normalized === 'use-stored' ? '' : normalized;
}

function validateEnum<T extends string>(value: DynamicValue, allowed: T[], fallback: T) {
  return allowed.includes(value) ? value : fallback;
}

function validateBoolean(value: DynamicValue, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function validatePositiveInteger(value: DynamicValue, fallback: number, { min = 1, max = 999 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function createDefaultRuntimeConfig() {
  return {
    id: 'default',
    name: 'Default',
    base: 'https://api.openai.com/v1',
    apiKey: '',
    models: [],
    providerConfig: sanitizeProviderConfig(DEFAULT_PROVIDER_CONFIG),
    projectModels: [],
  };
}

function cloneDefaultSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

function readLegacyBackendSettings() {
  return readJsonFile(LEGACY_PATHS.backendSettingsFile, null);
}

function readLegacyAssistantSettings() {
  return readJsonFile(LEGACY_PATHS.backendAssistantSettingsFile, null);
}

function getActiveLegacyConfig(settings: DynamicValue) {
  if (!settings || !Array.isArray(settings.ai_configs)) return null;
  const activeId = cleanOptionalString(settings.ai_active_config, 120);
  return settings.ai_configs.find((config: DynamicValue) => config?.id === activeId) || settings.ai_configs[0] || null;
}

function normalizeStreamingMode(value: DynamicValue, fallback: string) {
  if (value === 'real' || value === 'stream') return 'stream';
  if (value === 'non-stream') return 'non-stream';
  return fallback;
}

function sanitizeRole(value: DynamicValue) {
  if (!isPlainObject(value)) return null;
  const id = cleanOptionalString(value.id, 120);
  const name = cleanOptionalString(value.name, 80);
  const icon = cleanOptionalString(value.icon, 40);
  const systemPrompt = cleanOptionalString(value.systemPrompt, 20000);
  const tools = Array.isArray(value.tools)
    ? value.tools.filter((tool) => ['generate_image', 'generate_video', 'video_generate', 'web_search'].includes(tool))
    : [];
  if (!id || !name || !systemPrompt) return null;
  return { id, name, icon, systemPrompt, tools, isCustom: true };
}

function sanitizeRoleList(value: DynamicValue) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeRole).filter(Boolean);
}

function sanitizeApiConfig(value: DynamicValue) {
  if (!isPlainObject(value)) return null;
  const id = cleanOptionalString(value.id, 120);
  if (!id) return null;

  const providerConfig = sanitizeProviderConfig({
    ...DEFAULT_PROVIDER_CONFIG,
    ...(isPlainObject(value.providerConfig) ? value.providerConfig : {}),
  });

  return {
    id,
    name: cleanOptionalString(value.name, 80),
    base: cleanOptionalString(value.base, 2000),
    apiKey: cleanOptionalString(value.apiKey, 4000),
    models: Array.isArray(value.models)
      ? value.models
          .map((item) => {
            if (!isPlainObject(item)) return null;
            const modelId = cleanOptionalString(item.id, 200);
            const cat = ['chat', 'image', 'video'].includes(item.cat) ? item.cat : 'chat';
            return modelId ? { id: modelId, cat } : null;
          })
          .filter(Boolean)
      : [],
    providerConfig,
    projectModels: normalizeProjectModels(migrateProjectModels(value)),
  };
}

function sanitizeApiConfigForPublic(value: DynamicValue) {
  const config = sanitizeApiConfig(value);
  if (!config) return null;
  return {
    ...config,
    apiKey: '',
    apiKeySet: Boolean(config.apiKey),
  };
}

function sanitizeApiConfigList(value: DynamicValue) {
  if (!Array.isArray(value)) return [];
  const deduped = new Map<string, DynamicValue>();
  for (const item of value) {
    const normalized = sanitizeApiConfig(item);
    if (!normalized) continue;
    deduped.set(normalized.id, normalized);
  }
  return Array.from(deduped.values());
}

function sanitizeOutboundProxy(value: DynamicValue) {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_SETTINGS.runtime.outboundProxy };
  }

  const mode = ['system', 'direct', 'custom'].includes(value.mode) ? value.mode : 'system';
  return {
    mode,
    httpProxy: cleanOptionalString(value.httpProxy, 2000),
    httpsProxy: cleanOptionalString(value.httpsProxy, 2000),
    noProxy: cleanOptionalString(value.noProxy, 4000),
  };
}

function sanitizeWorkflowConcurrency(value: DynamicValue) {
  const defaults = DEFAULT_SETTINGS.workflow.concurrency;
  if (!isPlainObject(value)) return { ...defaults };
  return {
    enabled: validateBoolean(value.enabled, defaults.enabled),
    maxConcurrency: validatePositiveInteger(value.maxConcurrency, defaults.maxConcurrency, { min: 1, max: 999 }),
  };
}

function summarizeOutboundProxy(value: DynamicValue) {
  const proxy = sanitizeOutboundProxy(value);
  return {
    mode: proxy.mode,
    httpProxySet: Boolean(proxy.httpProxy),
    httpsProxySet: Boolean(proxy.httpsProxy),
    noProxy: proxy.noProxy,
  };
}

function buildRuntimeSectionFromLegacyAssistant(settings: DynamicValue) {
  if (!settings) return {};
  const activeConfig = getActiveLegacyConfig(settings);
  const configs = sanitizeApiConfigList(settings.ai_configs);
  const mergedConfigs = activeConfig
    ? sanitizeApiConfigList([
        { ...activeConfig, id: activeConfig.id || settings.ai_active_config || 'default' },
        ...configs,
      ])
    : configs;
  return {
    activeConfigId: cleanOptionalString(settings.ai_active_config, 120),
    tavilyApiKey: cleanOptionalString(settings.ai_tavily_key, 4000),
    configs: mergedConfigs,
  };
}

function buildUiSectionFromLegacyAssistant(settings: DynamicValue) {
  if (!settings) return {};
  return {
    theme: validateEnum(settings.ai_theme, ['dark', 'light', 'system'], DEFAULT_SETTINGS.ui.theme),
    sidebarCollapsed: validateBoolean(settings.ai_sidebar_collapsed, DEFAULT_SETTINGS.ui.sidebarCollapsed),
    lastTab: validateEnum(
      settings.ai_tab,
      ['chat', 'image', 'video', 'workflow', 'settings'],
      DEFAULT_SETTINGS.ui.lastTab,
    ),
    customRoles: sanitizeRoleList(settings.ai_custom_roles),
    chatStreamingMode: normalizeStreamingMode(
      settings.ai_chat_streaming_mode ?? settings.ai_streaming_mode,
      DEFAULT_SETTINGS.ui.chatStreamingMode,
    ),
    imageStreamingMode: normalizeStreamingMode(
      settings.ai_image_streaming_mode,
      DEFAULT_SETTINGS.ui.imageStreamingMode,
    ),
    videoStreamingMode: normalizeStreamingMode(
      settings.ai_video_streaming_mode,
      DEFAULT_SETTINGS.ui.videoStreamingMode,
    ),
  };
}

function buildRuntimeSectionFromLegacyBackend(settings: DynamicValue) {
  if (!settings || !isPlainObject(settings)) return {};
  const defaultConfigId = cleanOptionalString(settings.activeConfigId || 'default', 120) || 'default';
  const config = sanitizeApiConfig({
    id: defaultConfigId,
    name: cleanOptionalString(settings.name, 80) || 'Default',
    base: settings.baseUrl,
    apiKey: settings.apiKey,
    projectModels: settings.projectModels,
    providerConfig: settings.providerConfig,
  });

  return {
    activeConfigId: config?.id || '',
    tavilyApiKey: cleanOptionalString(settings.tavilyApiKey, 4000),
    configs: config ? [config] : [],
  };
}

function mergeRuntimeSections(...sections: DynamicValue[]) {
  const merged = {
    activeConfigId: '',
    tavilyApiKey: '',
    outboundProxy: { ...DEFAULT_SETTINGS.runtime.outboundProxy },
    configs: [] as DynamicValue[],
  };
  const byId = new Map<string, DynamicValue>();

  for (const section of sections) {
    if (!section) continue;
    if (section.activeConfigId) merged.activeConfigId = section.activeConfigId;
    if (section.tavilyApiKey) merged.tavilyApiKey = section.tavilyApiKey;
    if (isPlainObject(section.outboundProxy)) merged.outboundProxy = sanitizeOutboundProxy(section.outboundProxy);
    for (const config of section.configs || []) {
      byId.set(config.id, config);
    }
  }

  merged.configs = Array.from(byId.values());
  if (merged.configs.length === 0) {
    merged.configs = [createDefaultRuntimeConfig()];
  }
  if (!merged.activeConfigId && merged.configs[0]?.id) {
    merged.activeConfigId = merged.configs[0].id;
  }
  return merged;
}

function mergeSettingsPreservingSecrets(current: DynamicValue, patch: DynamicValue) {
  const next = {
    ...current,
    ...patch,
    ui: {
      ...current.ui,
      ...(isPlainObject(patch.ui) ? patch.ui : {}),
    },
    runtime: {
      ...current.runtime,
      ...(isPlainObject(patch.runtime) ? patch.runtime : {}),
    },
    workflow: {
      ...current.workflow,
      ...(isPlainObject(patch.workflow) ? patch.workflow : {}),
    },
    migrations: {
      ...current.migrations,
      ...(isPlainObject(patch.migrations) ? patch.migrations : {}),
    },
  };

  if (Array.isArray(patch.runtime?.configs)) {
    const currentById = new Map<string, DynamicValue>(
      (current.runtime?.configs || []).map((config: DynamicValue) => [config.id, config]),
    );
    next.runtime.configs = patch.runtime.configs.map((config: DynamicValue) => {
      const previous = currentById.get(config.id);
      const apiKey = cleanOptionalString(config.apiKey, 4000) || previous?.apiKey || '';
      return { ...config, apiKey };
    });
  }

  return next;
}

function sanitizeSettingsShape(input: DynamicValue) {
  const value = isPlainObject(input) ? input : {};
  const settings = cloneDefaultSettings();

  settings.version = SETTINGS_VERSION;
  settings.migrations = {
    legacyImported: Boolean(value.migrations?.legacyImported),
  };
  settings.ui = {
    theme: validateEnum(value.ui?.theme, ['dark', 'light', 'system'], DEFAULT_SETTINGS.ui.theme),
    sidebarCollapsed: validateBoolean(value.ui?.sidebarCollapsed, DEFAULT_SETTINGS.ui.sidebarCollapsed),
    lastTab: validateEnum(
      value.ui?.lastTab,
      ['chat', 'image', 'video', 'workflow', 'settings'],
      DEFAULT_SETTINGS.ui.lastTab,
    ),
    customRoles: sanitizeRoleList(value.ui?.customRoles),
    chatStreamingMode: normalizeStreamingMode(value.ui?.chatStreamingMode, DEFAULT_SETTINGS.ui.chatStreamingMode),
    imageStreamingMode: normalizeStreamingMode(value.ui?.imageStreamingMode, DEFAULT_SETTINGS.ui.imageStreamingMode),
    videoStreamingMode: normalizeStreamingMode(value.ui?.videoStreamingMode, DEFAULT_SETTINGS.ui.videoStreamingMode),
  };
  settings.runtime = mergeRuntimeSections({
    activeConfigId: cleanOptionalString(value.runtime?.activeConfigId, 120),
    tavilyApiKey: cleanOptionalString(value.runtime?.tavilyApiKey, 4000),
    outboundProxy: sanitizeOutboundProxy(value.runtime?.outboundProxy),
    configs: sanitizeApiConfigList(value.runtime?.configs),
  });
  settings.workflow = {
    snapToGrid: validateBoolean(value.workflow?.snapToGrid, DEFAULT_SETTINGS.workflow.snapToGrid),
    concurrency: sanitizeWorkflowConcurrency(value.workflow?.concurrency),
  };

  return settings;
}

function migrateLegacySettings() {
  const legacyBackend = readLegacyBackendSettings();
  const legacyAssistant = readLegacyAssistantSettings();
  return sanitizeSettingsShape({
    ...cloneDefaultSettings(),
    ui: {
      ...cloneDefaultSettings().ui,
      ...buildUiSectionFromLegacyAssistant(legacyAssistant),
    },
    runtime: mergeRuntimeSections(
      buildRuntimeSectionFromLegacyBackend(legacyBackend),
      buildRuntimeSectionFromLegacyAssistant(legacyAssistant),
    ),
    migrations: {
      legacyImported: Boolean(legacyBackend || legacyAssistant),
    },
  });
}

function ensureSettings() {
  ensureStorageDirectories();
  migrateLegacyStorageIfNeeded();
  const existing = readJsonFile(STORAGE_PATHS.settingsFile, null);
  if (!existing) {
    writeJsonFile(STORAGE_PATHS.settingsFile, migrateLegacySettings());
    return;
  }

  ensureJsonFile(STORAGE_PATHS.settingsFile, cloneDefaultSettings());
  const sanitized = sanitizeSettingsShape(existing);
  if (JSON.stringify(existing) !== JSON.stringify(sanitized)) {
    writeJsonFile(STORAGE_PATHS.settingsFile, sanitized);
  }
}

function getActiveRuntimeConfig(settings: DynamicValue = readSettingsInternal()) {
  const configs = settings.runtime.configs || [];
  const activeId = settings.runtime.activeConfigId;
  return configs.find((config: DynamicValue) => config.id === activeId) || configs[0] || null;
}

function buildRuntimeApiConfigInternal(overrides: DynamicValue = {}, scope?: DynamicValue) {
  const settings = readSettingsForScope(scope);
  const appConfig = appConfigRepository.readAppConfig();
  const appSearch = appConfigRepository.buildSearchConfig(appConfig);
  const appNetwork = appConfigRepository.buildNetworkConfig(appConfig);
  configureOutboundProxy(appNetwork.outboundProxy);
  const overrideConfigs = sanitizeApiConfigList(overrides.configs);
  const storedConfigs = settings.runtime.configs || [];
  const configs =
    overrideConfigs.length > 0
      ? overrideConfigs.map((config: DynamicValue) => {
          const stored = storedConfigs.find((item: DynamicValue) => item.id === config.id);
          return {
            ...config,
            apiKey: cleanSecretOverride(config.apiKey, 4000) || stored?.apiKey || '',
          };
        })
      : storedConfigs;
  const requestedConfigId = cleanOptionalString(overrides.configId, 120);
  const active =
    (requestedConfigId ? configs.find((config: DynamicValue) => config.id === requestedConfigId) : null) ||
    getActiveRuntimeConfig({ ...settings, runtime: { ...settings.runtime, configs } });
  const providerConfig = sanitizeProviderConfig({
    ...DEFAULT_PROVIDER_CONFIG,
    ...(active?.providerConfig || {}),
    ...(isPlainObject(overrides.providerConfig) ? overrides.providerConfig : {}),
  });
  const projectModels = normalizeProjectModels(overrides.projectModels || active?.projectModels || []);

  return {
    apiKey: cleanSecretOverride(overrides.apiKey, 4000) || active?.apiKey || '',
    tavilyApiKey: cleanOptionalString(overrides.tavilyApiKey, 4000) || appSearch.tavilyApiKey || '',
    webSearchEnabled: Boolean(appSearch.enabled && appSearch.tavilyApiKey),
    outboundProxy: appNetwork.outboundProxy,
    workflowExecution: settings.workflow.concurrency,
    baseUrl: cleanOptionalString(overrides.baseUrl, 2000) || active?.base || 'https://api.openai.com/v1',
    projectModels,
    providerConfig,
    configId: active?.id || '',
    configs,
  };
}

function getProviderModelId(model: DynamicValue) {
  if (typeof model === 'string') return model;
  return cleanOptionalString(model?.id, 200);
}

function isProviderModelAvailable(model: DynamicValue) {
  if (typeof model === 'string') return true;
  const status = cleanOptionalString(model?.status, 80).toLowerCase();
  return !['shutdown', 'stopped', 'offline'].includes(status);
}

function inferProviderModelType(model: DynamicValue) {
  const modelId = getProviderModelId(model);
  if (!modelId) return '';
  if (typeof model !== 'string') {
    const domain = cleanOptionalString(model?.domain, 80).toLowerCase();
    if (domain === 'imagegeneration') return 'image';
    if (domain === 'videogeneration') return 'video';
    if (domain === 'llm' || domain === 'vlm' || domain === 'router') return 'chat';
    if (domain === 'embedding' || domain === '3dgeneration') return '';
  }

  const lower = modelId.toLowerCase();
  if (/embedding|rerank|seed3d|hyper3d|hitem3d|3d/i.test(lower)) return '';
  return categorizeLegacyModel(modelId);
}

function classifyModels(providerModels: DynamicValue, providerConfig: DynamicValue) {
  const overrides = normalizeModelOverrides(providerConfig.modelOverrides);
  const discoveredModels = (Array.isArray(providerModels) ? providerModels : [])
    .filter(isProviderModelAvailable)
    .map((model) => ({
      id: getProviderModelId(model),
      type: inferProviderModelType(model),
    }))
    .filter((model) => model.id && model.type);
  const all = [...new Set([...discoveredModels.map((model) => model.id), ...Object.keys(overrides)])];
  const groups: Record<string, string[]> = { all, chat: [], image: [], video: [] };
  const discoveredTypes = new Map(discoveredModels.map((model) => [model.id, model.type]));

  for (const modelId of all) {
    const type = overrides[modelId]?.type || discoveredTypes.get(modelId) || categorizeLegacyModel(modelId);
    if (type === 'image') groups.image.push(modelId);
    else if (type === 'video') groups.video.push(modelId);
    else groups.chat.push(modelId);
  }

  return groups;
}

function readSettingsInternal() {
  ensureSettings();
  return sanitizeSettingsShape(readJsonFile(STORAGE_PATHS.settingsFile, cloneDefaultSettings()));
}

function shouldUseScopedSettings(_scope?: DynamicValue): boolean {
  return false;
}

function getSettingsFileForScope(scope?: DynamicValue): string {
  if (!shouldUseScopedSettings(scope)) return STORAGE_PATHS.settingsFile;
  ensureScopedStorageDirectories(scope);
  return getScopedStoragePaths(scope).settingsFile;
}

function ensureSettingsForScope(scope?: DynamicValue) {
  if (!shouldUseScopedSettings(scope)) {
    ensureSettings();
    return;
  }

  ensureStorageDirectories();
  migrateLegacyStorageIfNeeded();
  const settingsFile = getSettingsFileForScope(scope);
  const existing = readJsonFile(settingsFile, null);
  if (!existing) {
    const defaults = cloneDefaultSettings();
    defaults.runtime.configs = [createDefaultRuntimeConfig()];
    defaults.runtime.activeConfigId = 'default';
    writeJsonFile(settingsFile, defaults);
    return;
  }

  ensureJsonFile(settingsFile, cloneDefaultSettings());
  const sanitized = sanitizeSettingsShape(existing);
  if (JSON.stringify(existing) !== JSON.stringify(sanitized)) {
    writeJsonFile(settingsFile, sanitized);
  }
}

function readSettingsForScope(scope?: DynamicValue) {
  if (!shouldUseScopedSettings(scope)) return readSettingsInternal();
  ensureSettingsForScope(scope);
  return sanitizeSettingsShape(readJsonFile(getSettingsFileForScope(scope), cloneDefaultSettings()));
}

function writeSettingsForScope(settings: DynamicValue, scope?: DynamicValue) {
  writeJsonFile(getSettingsFileForScope(scope), settings);
}

export class SettingsRepository {
  readStorageSettings() {
    return getEffectiveStorageRootInfo();
  }

  updateStorageSettings(patch: DynamicValue) {
    assertPlainObject(patch, '外部路径设置更新体必须为对象');
    const customRoot = cleanOptionalString(patch.customRoot);
    if (!customRoot) {
      throw new ValidationError('SETTINGS_STORAGE_PATH_REQUIRED', '自定义外部路径不能为空');
    }
    writeStoredStorageRootOverride(customRoot);
    return this.readStorageSettings();
  }

  resetStorageSettings() {
    clearStoredStorageRootOverride();
    return this.readStorageSettings();
  }

  readSettings(scope?: DynamicValue) {
    return readSettingsForScope(scope);
  }

  updateSettings(patch: DynamicValue, scope?: DynamicValue) {
    assertPlainObject(patch, '设置更新体必须为对象');
    const current = this.readSettings(scope);
    const next = mergeSettingsPreservingSecrets(current, patch);
    const sanitized = sanitizeSettingsShape(next);
    writeSettingsForScope(sanitized, scope);
    return sanitized;
  }

  updateActiveRuntimeConfig(patch: DynamicValue, scope?: DynamicValue) {
    assertPlainObject(patch, '运行时设置更新体必须为对象');
    const settings = this.readSettings(scope);
    const active = getActiveRuntimeConfig(settings);
    if (!active) {
      throw new ValidationError('SETTINGS_NO_ACTIVE_CONFIG', '当前没有可更新的配置');
    }

    const providerConfig = sanitizeProviderConfig({
      ...(active.providerConfig || DEFAULT_PROVIDER_CONFIG),
      ...(isPlainObject(patch.providerConfig) ? patch.providerConfig : {}),
    });
    const projectModels = normalizeProjectModels(patch.projectModels ?? active.projectModels ?? []);
    const updatedConfig = {
      ...active,
      ...patch,
      id: active.id,
      base: cleanOptionalString(patch.baseUrl ?? patch.base, 2000) || active.base || '',
      apiKey: cleanOptionalString(patch.apiKey, 4000) || active.apiKey || '',
      projectModels,
      providerConfig,
    };

    const configs = settings.runtime.configs.map((config: DynamicValue) =>
      config.id === active.id ? updatedConfig : config,
    );
    const next = sanitizeSettingsShape({
      ...settings,
      runtime: {
        ...settings.runtime,
        tavilyApiKey: cleanOptionalString(patch.tavilyApiKey, 4000) || settings.runtime.tavilyApiKey,
        configs,
      },
    });
    writeSettingsForScope(next, scope);
    return next;
  }

  resetSettings(scope?: DynamicValue) {
    const defaults = cloneDefaultSettings();
    defaults.runtime.configs = [createDefaultRuntimeConfig()];
    defaults.runtime.activeConfigId = 'default';
    writeSettingsForScope(defaults, scope);
    return defaults;
  }

  buildRuntimeApiConfig(overrides: DynamicValue = {}, scope?: DynamicValue) {
    return buildRuntimeApiConfigInternal(overrides, scope);
  }

  buildSettingsResponse(settings?: DynamicValue) {
    const currentSettings = settings || this.readSettings();
    const active = getActiveRuntimeConfig(currentSettings);
    const projectModels = normalizeProjectModels(active?.projectModels || []);
    const { outboundProxy: _legacyOutboundProxy, ...publicRuntime } = currentSettings.runtime;
    return {
      version: currentSettings.version,
      ui: currentSettings.ui,
      runtime: {
        ...publicRuntime,
        tavilyApiKey: undefined,
        configs: currentSettings.runtime.configs.map((config: DynamicValue) => ({
          ...config,
          apiKey: undefined,
          apiKeySet: Boolean(config.apiKey),
        })),
      },
      workflow: currentSettings.workflow,
      activeConfig: active
        ? {
            ...active,
            apiKey: '',
            apiKeySet: Boolean(active.apiKey),
          }
        : null,
      apiKeySet: Boolean(active?.apiKey),
      tavilyApiKeySet: Boolean(currentSettings.runtime.tavilyApiKey),
      baseUrl: active?.base || 'https://api.openai.com/v1',
      projectModels,
      providerConfig: sanitizeProviderConfig(active?.providerConfig || DEFAULT_PROVIDER_CONFIG),
      availableProjectModels: groupConfiguredProjectModels(projectModels),
    };
  }

  buildStudioSettingsResponse(settings?: DynamicValue) {
    const currentSettings = settings || this.readSettings();
    return {
      version: currentSettings.version,
      migrations: currentSettings.migrations,
      ui: currentSettings.ui,
      runtime: {
        ...currentSettings.runtime,
        configs: currentSettings.runtime.configs
          .map((config: DynamicValue) => sanitizeApiConfigForPublic(config))
          .filter(Boolean),
      },
      workflow: currentSettings.workflow,
    };
  }

  async fetchModelsFromProvider({ apiKey, baseUrl, providerConfig }: DynamicValue) {
    if (!apiKey) {
      throw new ValidationError('SETTINGS_API_KEY_REQUIRED', '请先在 Studio 设置页配置 API Key');
    }

    await assertSafeProviderBaseUrl(baseUrl || 'https://api.openai.com/v1', 'Base URL');

    const adapter = getProviderAdapter();
    const request = adapter.buildRawRequest({
      apiKey,
      providerConfig,
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      endpoint: providerConfig.modelsEndpoint || '/models',
      headers: { 'Content-Type': undefined as DynamicValue },
      signal: AbortSignal.timeout(15000),
    } as DynamicValue);
    (request.options.headers as DynamicValue)['Content-Type'] = undefined;

    let response: Response;
    try {
      response = await proxyAwareFetch(request.url, request.options);
    } catch (error) {
      throw toProviderError(error, 'PROVIDER_FETCH_FAILED', request.url);
    }

    if (!response.ok) {
      throw new ProviderError('PROVIDER_FETCH_FAILED', await parseProviderErrorResponse(response, '获取模型失败'));
    }

    const data = await response.json();
    const allModels = (data.data || [])
      .filter((model: DynamicValue) => getProviderModelId(model))
      .sort((left: DynamicValue, right: DynamicValue) =>
        String(getProviderModelId(left)).localeCompare(String(getProviderModelId(right))),
      );

    return classifyModels(allModels, providerConfig);
  }
}

export const settingsRepository = new SettingsRepository();
