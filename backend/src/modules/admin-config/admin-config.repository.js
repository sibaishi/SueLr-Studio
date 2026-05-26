import { ValidationError } from '../../app/errors/index.js';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  migrateLegacyStorageIfNeeded,
  readJsonFile,
  writeJsonFile,
} from '../../platform/storage/index.js';

const ADMIN_CONFIG_VERSION = 1;

const DEFAULT_ADMIN_CONFIG = {
  version: ADMIN_CONFIG_VERSION,
  search: {
    enabled: false,
    provider: 'tavily',
    providerConfig: {
      tavilyApiKey: '',
    },
  },
  network: {
    outboundProxy: {
      mode: 'system',
      httpProxy: '',
      httpsProxy: '',
      noProxy: '',
    },
  },
  features: {
    adminConsoleEnabled: true,
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanOptionalString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeOutboundProxy(value) {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_ADMIN_CONFIG.network.outboundProxy };
  }

  const mode = ['system', 'direct', 'custom'].includes(value.mode) ? value.mode : 'system';
  return {
    mode,
    httpProxy: cleanOptionalString(value.httpProxy, 2000),
    httpsProxy: cleanOptionalString(value.httpsProxy, 2000),
    noProxy: cleanOptionalString(value.noProxy, 4000),
  };
}

function cloneDefaultAdminConfig() {
  return structuredClone(DEFAULT_ADMIN_CONFIG);
}

function sanitizeAdminConfigShape(input) {
  const value = isPlainObject(input) ? input : {};
  const config = cloneDefaultAdminConfig();
  config.version = ADMIN_CONFIG_VERSION;
  config.search = {
    enabled: validateBoolean(value.search?.enabled, DEFAULT_ADMIN_CONFIG.search.enabled),
    provider: cleanOptionalString(value.search?.provider, 40) || DEFAULT_ADMIN_CONFIG.search.provider,
    providerConfig: {
      tavilyApiKey: cleanOptionalString(value.search?.providerConfig?.tavilyApiKey, 4000),
    },
  };
  config.network = {
    outboundProxy: sanitizeOutboundProxy(value.network?.outboundProxy),
  };
  config.features = {
    adminConsoleEnabled: validateBoolean(value.features?.adminConsoleEnabled, true),
  };
  return config;
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

function readLegacySearchAndProxySettings() {
  const settings = readJsonFile(STORAGE_PATHS.settingsFile, null);
  return {
    search: {
      enabled: Boolean(settings?.runtime?.tavilyApiKey),
      provider: 'tavily',
      providerConfig: {
        tavilyApiKey: cleanOptionalString(settings?.runtime?.tavilyApiKey, 4000),
      },
    },
    network: {
      outboundProxy: sanitizeOutboundProxy(settings?.runtime?.outboundProxy),
    },
  };
}

function ensureAdminConfig() {
  ensureStorageDirectories();
  migrateLegacyStorageIfNeeded();
  const adminConfigPath = STORAGE_PATHS.adminConfigFile;
  const existing = readJsonFile(adminConfigPath, null);
  if (!existing) {
    const migrated = sanitizeAdminConfigShape({
      ...cloneDefaultAdminConfig(),
      ...readLegacySearchAndProxySettings(),
    });
    writeJsonFile(adminConfigPath, migrated);
    return;
  }

  ensureJsonFile(adminConfigPath, cloneDefaultAdminConfig());
  const sanitized = sanitizeAdminConfigShape(existing);
  if (JSON.stringify(existing) !== JSON.stringify(sanitized)) {
    writeJsonFile(adminConfigPath, sanitized);
  }
}

function readAdminConfigInternal() {
  ensureAdminConfig();
  return sanitizeAdminConfigShape(readJsonFile(STORAGE_PATHS.adminConfigFile, cloneDefaultAdminConfig()));
}

export class AdminConfigRepository {
  readAdminConfig() {
    return readAdminConfigInternal();
  }

  updateAdminConfig(patch) {
    if (!isPlainObject(patch)) {
      throw new ValidationError('VALIDATION_ERROR', '管理员配置更新体必须为对象');
    }

    const current = this.readAdminConfig();
    const next = sanitizeAdminConfigShape({
      ...current,
      ...patch,
      search: {
        ...current.search,
        ...(isPlainObject(patch.search) ? patch.search : {}),
        providerConfig: {
          ...current.search.providerConfig,
          ...(isPlainObject(patch.search?.providerConfig) ? patch.search.providerConfig : {}),
        },
      },
      network: {
        ...current.network,
        ...(isPlainObject(patch.network) ? patch.network : {}),
        outboundProxy: sanitizeOutboundProxy(patch.network?.outboundProxy ?? current.network.outboundProxy),
      },
      features: {
        ...current.features,
        ...(isPlainObject(patch.features) ? patch.features : {}),
      },
    });

    writeJsonFile(STORAGE_PATHS.adminConfigFile, next);
    return next;
  }

  buildPublicAdminConfig(config = this.readAdminConfig()) {
    return {
      version: config.version,
      search: {
        enabled: config.search.enabled,
        provider: config.search.provider,
        providerConfig: {
          tavilyApiKey: undefined,
          tavilyApiKeySet: Boolean(config.search.providerConfig.tavilyApiKey),
        },
      },
      network: {
        outboundProxy: summarizeOutboundProxy(config.network.outboundProxy),
      },
      features: config.features,
    };
  }

  buildSearchConfig(config = this.readAdminConfig()) {
    return {
      enabled: Boolean(config.search.enabled),
      provider: config.search.provider,
      tavilyApiKey: cleanOptionalString(config.search.providerConfig.tavilyApiKey, 4000),
    };
  }

  buildNetworkConfig(config = this.readAdminConfig()) {
    return {
      outboundProxy: sanitizeOutboundProxy(config.network.outboundProxy),
    };
  }
}

export const adminConfigRepository = new AdminConfigRepository();
