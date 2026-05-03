import { settingsRepository } from '../src/modules/settings/settings.repository.js';

export const DEFAULT_SETTINGS = {
  version: 1,
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
    configs: [],
  },
  workflow: {
    snapToGrid: true,
  },
};

export function ensureSettings() {
  return settingsRepository.readSettings();
}

export function readSettings() {
  return settingsRepository.readSettings();
}

export function writeSettings(settings) {
  return settingsRepository.updateSettings(settings);
}

export function updateSettings(patch) {
  return settingsRepository.updateSettings(patch);
}

export function resetSettings() {
  return settingsRepository.resetSettings();
}

export function getActiveRuntimeConfig(settings = readSettings()) {
  const configs = settings.runtime?.configs || [];
  const activeId = settings.runtime?.activeConfigId;
  return configs.find((config) => config.id === activeId) || configs[0] || null;
}

export function buildRuntimeApiConfig(overrides = {}) {
  return settingsRepository.buildRuntimeApiConfig(overrides);
}

export function buildSettingsResponse(settings = readSettings()) {
  return settingsRepository.buildSettingsResponse(settings);
}

export function updateActiveRuntimeConfig(patch) {
  return settingsRepository.updateActiveRuntimeConfig(patch);
}

export async function fetchModelsFromProvider(runtimeConfig) {
  return settingsRepository.fetchModelsFromProvider(runtimeConfig);
}
