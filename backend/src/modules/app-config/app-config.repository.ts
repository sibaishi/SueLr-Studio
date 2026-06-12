import { ValidationError } from '../../app/errors/index.ts';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  migrateLegacyStorageIfNeeded,
  readJsonFile,
  writeJsonFile,
} from '../../platform/storage/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

const APP_CONFIG_VERSION = 1;

const DEFAULT_APP_CONFIG = {
  version: APP_CONFIG_VERSION,
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
  email: {
    provider: 'none',
    from: 'SueLr Studio <no-reply@studio.suelr.com>',
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
    },
  },
};

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanOptionalString(value: DynamicValue, maxLength = 5000): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateBoolean(value: DynamicValue, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function validateNumber(value: DynamicValue, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeOutboundProxy(value: DynamicValue) {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_APP_CONFIG.network.outboundProxy };
  }

  const mode = ['system', 'direct', 'custom'].includes(value.mode) ? value.mode : 'system';
  return {
    mode,
    httpProxy: cleanOptionalString(value.httpProxy, 2000),
    httpsProxy: cleanOptionalString(value.httpsProxy, 2000),
    noProxy: cleanOptionalString(value.noProxy, 4000),
  };
}

function cloneDefaultAppConfig() {
  return structuredClone(DEFAULT_APP_CONFIG);
}

function sanitizeAppConfigShape(input: DynamicValue) {
  const value = isPlainObject(input) ? input : {};
  const config = cloneDefaultAppConfig();
  config.version = APP_CONFIG_VERSION;
  config.search = {
    enabled: validateBoolean(value.search?.enabled, DEFAULT_APP_CONFIG.search.enabled),
    provider: cleanOptionalString(value.search?.provider, 40) || DEFAULT_APP_CONFIG.search.provider,
    providerConfig: {
      tavilyApiKey: cleanOptionalString(value.search?.providerConfig?.tavilyApiKey, 4000),
    },
  };
  config.network = {
    outboundProxy: sanitizeOutboundProxy(value.network?.outboundProxy),
  };
  config.email = {
    provider: value.email?.provider === 'smtp' ? 'smtp' : 'none',
    from: cleanOptionalString(value.email?.from, 320) || DEFAULT_APP_CONFIG.email.from,
    smtp: {
      host: cleanOptionalString(value.email?.smtp?.host, 320),
      port: Math.min(Math.max(Math.trunc(validateNumber(value.email?.smtp?.port, 587)), 1), 65535),
      secure: validateBoolean(value.email?.smtp?.secure, false),
      user: cleanOptionalString(value.email?.smtp?.user, 320),
      pass: cleanOptionalString(value.email?.smtp?.pass, 4000),
    },
  };
  return config;
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

function readLegacySearchAndProxySettings() {
  const settings = readJsonFile(STORAGE_PATHS.settingsFile, null) as DynamicValue;
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

function ensureAppConfig() {
  ensureStorageDirectories();
  migrateLegacyStorageIfNeeded();
  const appConfigPath = STORAGE_PATHS.appConfigFile;
  const existing = readJsonFile(appConfigPath, null);
  if (!existing) {
    const migrated = sanitizeAppConfigShape({
      ...cloneDefaultAppConfig(),
      ...readLegacySearchAndProxySettings(),
    });
    writeJsonFile(appConfigPath, migrated);
    return;
  }

  ensureJsonFile(appConfigPath, cloneDefaultAppConfig());
  const sanitized = sanitizeAppConfigShape(existing);
  if (JSON.stringify(existing) !== JSON.stringify(sanitized)) {
    writeJsonFile(appConfigPath, sanitized);
  }
}

function readAppConfigInternal() {
  ensureAppConfig();
  return sanitizeAppConfigShape(readJsonFile(STORAGE_PATHS.appConfigFile, cloneDefaultAppConfig()));
}

export class AppConfigRepository {
  readAppConfig() {
    return readAppConfigInternal();
  }

  updateAppConfig(patch: DynamicValue) {
    if (!isPlainObject(patch)) {
      throw new ValidationError('VALIDATION_ERROR', '配置更新体必须为对象');
    }

    const current = this.readAppConfig();
    const next = sanitizeAppConfigShape({
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
      email: {
        ...current.email,
        ...(isPlainObject(patch.email) ? patch.email : {}),
        smtp: {
          ...current.email.smtp,
          ...(isPlainObject(patch.email?.smtp) ? patch.email.smtp : {}),
        },
      },
    });

    writeJsonFile(STORAGE_PATHS.appConfigFile, next);
    return next;
  }

  buildPublicAppConfig(config = this.readAppConfig()) {
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
      email: {
        provider: config.email.provider,
        from: config.email.from,
        smtp: {
          host: undefined,
          hostSet: Boolean(config.email.smtp.host),
          port: config.email.smtp.port,
          secure: config.email.smtp.secure,
          user: undefined,
          userSet: Boolean(config.email.smtp.user),
          pass: undefined,
          passSet: Boolean(config.email.smtp.pass),
        },
      },
    };
  }

  buildSearchConfig(config = this.readAppConfig()) {
    return {
      enabled: Boolean(config.search.enabled),
      provider: config.search.provider,
      tavilyApiKey: cleanOptionalString(config.search.providerConfig.tavilyApiKey, 4000),
    };
  }

  buildNetworkConfig(config = this.readAppConfig()) {
    return {
      outboundProxy: sanitizeOutboundProxy(config.network.outboundProxy),
    };
  }

  buildEmailConfig(config = this.readAppConfig()) {
    return {
      provider: config.email.provider,
      from: config.email.from,
      smtp: {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    };
  }
}

export const appConfigRepository = new AppConfigRepository();
