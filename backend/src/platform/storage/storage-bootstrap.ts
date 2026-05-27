import path from 'node:path';
import { ValidationError } from '../../app/errors/index.js';
import { readJsonFile, writeJsonFile } from './json-store.js';
import { PROJECT_ROOT, getDefaultConfigRoot } from './storage-base.js';

const BOOTSTRAP_CONFIG_VERSION = 1;

interface BootstrapConfig {
  version: number;
  storageRootOverride: string;
}

export interface EffectiveStorageRootInfo {
  effectiveRoot: string;
  defaultRoot: string;
  customRoot: string;
  source: 'env' | 'custom' | 'legacy' | 'default';
  restartRequired: boolean;
  envOverride: string;
  legacyRoot: string;
}

function cleanOptionalString(value: unknown, maxLength = 4000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function getBootstrapConfigPath() {
  if (process.env.APP_STORAGE_BOOTSTRAP_FILE) {
    return path.resolve(process.env.APP_STORAGE_BOOTSTRAP_FILE);
  }
  return path.join(getDefaultConfigRoot(), 'config', 'bootstrap.json');
}

function getDefaultBootstrapConfig(): BootstrapConfig {
  return {
    version: BOOTSTRAP_CONFIG_VERSION,
    storageRootOverride: '',
  };
}

function sanitizeBootstrapConfig(input: Partial<BootstrapConfig> | null | undefined): BootstrapConfig {
  return {
    version: BOOTSTRAP_CONFIG_VERSION,
    storageRootOverride: cleanOptionalString(input?.storageRootOverride),
  };
}

function readBootstrapConfig() {
  const config = readJsonFile(getBootstrapConfigPath(), getDefaultBootstrapConfig());
  return sanitizeBootstrapConfig(config);
}

function resolveLegacyStorageRoot() {
  if (!process.env.APP_STORAGE_DIR) return '';
  return path.resolve(PROJECT_ROOT, process.env.APP_STORAGE_DIR);
}

function getStoredStorageRootOverride() {
  const config = readBootstrapConfig();
  return config.storageRootOverride ? path.resolve(config.storageRootOverride) : '';
}

function writeStoredStorageRootOverride(rootPath: string) {
  const nextRoot = cleanOptionalString(rootPath);
  if (!nextRoot) {
    throw new ValidationError('SETTINGS_STORAGE_PATH_REQUIRED', '自定义外部路径不能为空');
  }
  if (!path.isAbsolute(nextRoot)) {
    throw new ValidationError('SETTINGS_STORAGE_PATH_ABSOLUTE_REQUIRED', '自定义外部路径必须是绝对路径');
  }
  const nextConfig = {
    ...readBootstrapConfig(),
    storageRootOverride: path.resolve(nextRoot),
  };
  writeJsonFile(getBootstrapConfigPath(), nextConfig);
}

function clearStoredStorageRootOverride() {
  writeJsonFile(getBootstrapConfigPath(), {
    ...readBootstrapConfig(),
    storageRootOverride: '',
  });
}

function getEffectiveStorageRootInfo(): EffectiveStorageRootInfo {
  const defaultRoot = getDefaultConfigRoot();
  const customRoot = getStoredStorageRootOverride();
  const envRoot = cleanOptionalString(process.env.APP_CONFIG_DIR);
  const legacyRoot = resolveLegacyStorageRoot();

  if (envRoot) {
    return {
      effectiveRoot: path.resolve(envRoot),
      defaultRoot,
      customRoot,
      source: 'env',
      restartRequired: true,
      envOverride: path.resolve(envRoot),
      legacyRoot,
    };
  }

  if (customRoot) {
    return {
      effectiveRoot: customRoot,
      defaultRoot,
      customRoot,
      source: 'custom',
      restartRequired: true,
      envOverride: '',
      legacyRoot,
    };
  }

  if (legacyRoot) {
    return {
      effectiveRoot: legacyRoot,
      defaultRoot,
      customRoot: '',
      source: 'legacy',
      restartRequired: true,
      envOverride: '',
      legacyRoot,
    };
  }

  return {
    effectiveRoot: defaultRoot,
    defaultRoot,
    customRoot: '',
    source: 'default',
    restartRequired: true,
    envOverride: '',
    legacyRoot: '',
  };
}

export {
  clearStoredStorageRootOverride,
  getBootstrapConfigPath,
  getEffectiveStorageRootInfo,
  getStoredStorageRootOverride,
  writeStoredStorageRootOverride,
};
