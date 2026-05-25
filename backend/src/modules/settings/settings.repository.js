import {
  categorizeLegacyModel,
  groupConfiguredProjectModels,
  migrateProjectModels,
  normalizeProjectModels,
} from '../../engine/helpers/projectModels.js';
import { ProviderError, ValidationError } from '../../app/errors/index.js';
import {
  clearStoredStorageRootOverride,
  getEffectiveStorageRootInfo,
  LEGACY_PATHS,
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  migrateLegacyStorageIfNeeded,
  readJsonFile,
  writeStoredStorageRootOverride,
  writeJsonFile,
} from '../../platform/storage/index.js';
import { getProviderAdapter } from '../../platform/providers/index.js';
import { configureOutboundProxy, proxyAwareFetch } from '../../platform/http/proxy-aware-fetch.js';
import { parseProviderErrorResponse, toProviderError } from '../../platform/providers/provider-http.js';
import { assertSafeProviderBaseUrl } from '../../platform/security/network-guards.js';
import { normalizeModelOverrides, sanitizeProviderConfig } from './settings.shared.js';

const SETTINGS_VERSION = 1;

const DEFAULT_SETTINGS = {
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

const DEFAULT_PROVIDER_CONFIG = {
  authType: 'bearer',
  chatEndpoint: '/v1/chat/completions',
  modelsEndpoint: '/v1/models',
  imageEndpoint: '/v1/images/generations',
  imageEditEndpoint: '/v1/images/edits',
  imageTimeoutMs: 300000,
  videoEndpoint: '/v1/video/generations',
  modelOverrides: {},
};

function assertPlainObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanOptionalString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function cleanSecretOverride(value, maxLength = 5000) {
  const normalized = cleanOptionalString(value, maxLength);
  return normalized === 'use-stored' ? '' : normalized;
}

function validateEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function validateBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function validatePositiveInteger(value, fallback, { min = 1, max = 999 } = {}) {
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

function getActiveLegacyConfig(settings) {
  if (!settings || !Array.isArray(settings.ai_configs)) return null;
  const activeId = cleanOptionalString(settings.ai_active_config, 120);
  return settings.ai_configs.find((config) => config?.id === activeId) || settings.ai_configs[0] || null;
}

function normalizeStreamingMode(value, fallback) {
  if (value === 'real' || value === 'stream') return 'stream';
  if (value === 'non-stream') return 'non-stream';
  return fallback;
}

function sanitizeRole(value) {
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

function sanitizeRoleList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeRole).filter(Boolean);
}

function sanitizeApiConfig(value) {
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

function sanitizeApiConfigForPublic(value) {
  const config = sanitizeApiConfig(value);
  if (!config) return null;
  return {
    ...config,
    apiKey: '',
    apiKeySet: Boolean(config.apiKey),
  };
}

function sanitizeApiConfigList(value) {
  if (!Array.isArray(value)) return [];
  const deduped = new Map();
  for (const item of value) {
    const normalized = sanitizeApiConfig(item);
    if (!normalized) continue;
    deduped.set(normalized.id, normalized);
  }
  return Array.from(deduped.values());
}

function sanitizeOutboundProxy(value) {
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

function sanitizeWorkflowConcurrency(value) {
  const defaults = DEFAULT_SETTINGS.workflow.concurrency;
  if (!isPlainObject(value)) return { ...defaults };
  return {
    enabled: validateBoolean(value.enabled, defaults.enabled),
    maxConcurrency: validatePositiveInteger(value.maxConcurrency, defaults.maxConcurrency, { min: 1, max: 999 }),
  };
}

function summarizeOutboundProxy(value) {
  const proxy = sanitizeOutboundProxy(value);
  return {
    mode: proxy.mode,
    httpProxySet: Boolean(proxy.httpProxy),
    httpsProxySet: Boolean(proxy.httpsProxy),
    noProxy: proxy.noProxy,
  };
}

function buildRuntimeSectionFromLegacyAssistant(settings) {
  if (!settings) return {};
  const activeConfig = getActiveLegacyConfig(settings);
  const configs = sanitizeApiConfigList(settings.ai_configs);
  const mergedConfigs = activeConfig
    ? sanitizeApiConfigList([{ ...activeConfig, id: activeConfig.id || settings.ai_active_config || 'default' }, ...configs])
    : configs;
  return {
    activeConfigId: cleanOptionalString(settings.ai_active_config, 120),
    tavilyApiKey: cleanOptionalString(settings.ai_tavily_key, 4000),
    configs: mergedConfigs,
  };
}

function buildUiSectionFromLegacyAssistant(settings) {
  if (!settings) return {};
  return {
    theme: validateEnum(settings.ai_theme, ['dark', 'light', 'system'], DEFAULT_SETTINGS.ui.theme),
    sidebarCollapsed: validateBoolean(settings.ai_sidebar_collapsed, DEFAULT_SETTINGS.ui.sidebarCollapsed),
    lastTab: validateEnum(settings.ai_tab, ['chat', 'image', 'video', 'workflow', 'settings'], DEFAULT_SETTINGS.ui.lastTab),
    customRoles: sanitizeRoleList(settings.ai_custom_roles),
    chatStreamingMode: normalizeStreamingMode(settings.ai_chat_streaming_mode ?? settings.ai_streaming_mode, DEFAULT_SETTINGS.ui.chatStreamingMode),
    imageStreamingMode: normalizeStreamingMode(settings.ai_image_streaming_mode, DEFAULT_SETTINGS.ui.imageStreamingMode),
    videoStreamingMode: normalizeStreamingMode(settings.ai_video_streaming_mode, DEFAULT_SETTINGS.ui.videoStreamingMode),
  };
}

function buildRuntimeSectionFromLegacyBackend(settings) {
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

function mergeRuntimeSections(...sections) {
  const merged = { activeConfigId: '', tavilyApiKey: '', outboundProxy: { ...DEFAULT_SETTINGS.runtime.outboundProxy }, configs: [] };
  const byId = new Map();

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

function mergeSettingsPreservingSecrets(current, patch) {
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
    const currentById = new Map((current.runtime?.configs || []).map((config) => [config.id, config]));
    next.runtime.configs = patch.runtime.configs.map((config) => {
      const previous = currentById.get(config.id);
      const apiKey = cleanOptionalString(config.apiKey, 4000) || previous?.apiKey || '';
      return { ...config, apiKey };
    });
  }

  return next;
}

function sanitizeSettingsShape(input) {
  const value = isPlainObject(input) ? input : {};
  const settings = cloneDefaultSettings();

  settings.version = SETTINGS_VERSION;
  settings.migrations = {
    legacyImported: Boolean(value.migrations?.legacyImported),
  };
  settings.ui = {
    theme: validateEnum(value.ui?.theme, ['dark', 'light', 'system'], DEFAULT_SETTINGS.ui.theme),
    sidebarCollapsed: validateBoolean(value.ui?.sidebarCollapsed, DEFAULT_SETTINGS.ui.sidebarCollapsed),
    lastTab: validateEnum(value.ui?.lastTab, ['chat', 'image', 'video', 'workflow', 'settings'], DEFAULT_SETTINGS.ui.lastTab),
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

function getActiveRuntimeConfig(settings = readSettingsInternal()) {
  const configs = settings.runtime.configs || [];
  const activeId = settings.runtime.activeConfigId;
  return configs.find((config) => config.id === activeId) || configs[0] || null;
}

function buildRuntimeApiConfigInternal(overrides = {}) {
  const settings = readSettingsInternal();
  configureOutboundProxy(settings.runtime.outboundProxy);
  const overrideConfigs = sanitizeApiConfigList(overrides.configs);
  const configs = overrideConfigs.length > 0 ? overrideConfigs : settings.runtime.configs || [];
  const requestedConfigId = cleanOptionalString(overrides.configId, 120);
  const active = (requestedConfigId ? configs.find((config) => config.id === requestedConfigId) : null)
    || getActiveRuntimeConfig({ ...settings, runtime: { ...settings.runtime, configs } });
  const providerConfig = sanitizeProviderConfig({
    ...DEFAULT_PROVIDER_CONFIG,
    ...(active?.providerConfig || {}),
    ...(isPlainObject(overrides.providerConfig) ? overrides.providerConfig : {}),
  });
  const projectModels = normalizeProjectModels(overrides.projectModels || active?.projectModels || []);

  return {
    apiKey: cleanSecretOverride(overrides.apiKey, 4000) || active?.apiKey || '',
    tavilyApiKey: cleanOptionalString(overrides.tavilyApiKey, 4000) || settings.runtime.tavilyApiKey || '',
    outboundProxy: settings.runtime.outboundProxy,
    workflowExecution: settings.workflow.concurrency,
    baseUrl: cleanOptionalString(overrides.baseUrl, 2000) || active?.base || 'https://api.openai.com/v1',
    projectModels,
    providerConfig,
    configId: active?.id || '',
    configs,
  };
}

function getProviderModelId(model) {
  if (typeof model === 'string') return model;
  return cleanOptionalString(model?.id, 200);
}

function isProviderModelAvailable(model) {
  if (typeof model === 'string') return true;
  const status = cleanOptionalString(model?.status, 80).toLowerCase();
  return !['shutdown', 'stopped', 'offline'].includes(status);
}

function inferProviderModelType(model) {
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

function classifyModels(providerModels, providerConfig) {
  const overrides = normalizeModelOverrides(providerConfig.modelOverrides);
  const discoveredModels = (Array.isArray(providerModels) ? providerModels : [])
    .filter(isProviderModelAvailable)
    .map((model) => ({
      id: getProviderModelId(model),
      type: inferProviderModelType(model),
    }))
    .filter((model) => model.id && model.type);
  const all = [...new Set([...discoveredModels.map((model) => model.id), ...Object.keys(overrides)])];
  const groups = { all, chat: [], image: [], video: [] };
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

export class SettingsRepository {
  readStorageSettings() {
    return getEffectiveStorageRootInfo();
  }

  updateStorageSettings(patch) {
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

  readSettings() {
    return readSettingsInternal();
  }

  updateSettings(patch) {
    assertPlainObject(patch, '设置更新体必须为对象');
    const current = this.readSettings();
    const next = mergeSettingsPreservingSecrets(current, patch);
    const sanitized = sanitizeSettingsShape(next);
    configureOutboundProxy(sanitized.runtime.outboundProxy);
    writeJsonFile(STORAGE_PATHS.settingsFile, sanitized);
    return sanitized;
  }

  updateActiveRuntimeConfig(patch) {
    assertPlainObject(patch, '运行时设置更新体必须为对象');
    const settings = this.readSettings();
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

    const configs = settings.runtime.configs.map((config) => (config.id === active.id ? updatedConfig : config));
    const next = sanitizeSettingsShape({
      ...settings,
      runtime: {
        ...settings.runtime,
        tavilyApiKey: cleanOptionalString(patch.tavilyApiKey, 4000) || settings.runtime.tavilyApiKey,
        configs,
      },
    });
    writeJsonFile(STORAGE_PATHS.settingsFile, next);
    return next;
  }

  resetSettings() {
    const defaults = cloneDefaultSettings();
    defaults.runtime.configs = [createDefaultRuntimeConfig()];
    defaults.runtime.activeConfigId = 'default';
    writeJsonFile(STORAGE_PATHS.settingsFile, defaults);
    return defaults;
  }

  buildRuntimeApiConfig(overrides = {}) {
    return buildRuntimeApiConfigInternal(overrides);
  }

  buildSettingsResponse(settings) {
    const currentSettings = settings || this.readSettings();
    const active = getActiveRuntimeConfig(currentSettings);
    const projectModels = normalizeProjectModels(active?.projectModels || []);
    return {
      version: currentSettings.version,
      ui: currentSettings.ui,
      runtime: {
        ...currentSettings.runtime,
        tavilyApiKey: undefined,
        outboundProxy: summarizeOutboundProxy(currentSettings.runtime.outboundProxy),
        configs: currentSettings.runtime.configs.map((config) => ({
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

  buildStudioSettingsResponse(settings) {
    const currentSettings = settings || this.readSettings();
    return {
      version: currentSettings.version,
      migrations: currentSettings.migrations,
      ui: currentSettings.ui,
      runtime: {
        ...currentSettings.runtime,
        configs: currentSettings.runtime.configs.map((config) => sanitizeApiConfigForPublic(config)).filter(Boolean),
      },
      workflow: currentSettings.workflow,
    };
  }

  async fetchModelsFromProvider({ apiKey, baseUrl, providerConfig }) {
    if (!apiKey) {
      throw new ValidationError('SETTINGS_API_KEY_REQUIRED', '请先在 Studio 设置页配置 API Key');
    }

    await assertSafeProviderBaseUrl(baseUrl || 'https://api.openai.com/v1', 'Base URL');

    const adapter = getProviderAdapter(providerConfig);
    const request = adapter.buildRawRequest({
      apiKey,
      providerConfig,
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      endpoint: providerConfig.modelsEndpoint || '/models',
      headers: { 'Content-Type': undefined },
      signal: AbortSignal.timeout(15000),
    });
    delete request.options.headers['Content-Type'];

    let response;
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
      .filter((model) => getProviderModelId(model))
      .sort((left, right) => String(getProviderModelId(left)).localeCompare(String(getProviderModelId(right))));

    return classifyModels(allModels, providerConfig);
  }
}

export const settingsRepository = new SettingsRepository();
