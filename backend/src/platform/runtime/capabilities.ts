import { appConfigRepository } from '../../modules/app-config/app-config.repository.ts';
import { readJsonFile, STORAGE_PATHS } from '../storage/index.ts';
import { type RuntimeMode, getRuntimeMode } from './mode.ts';

interface RuntimeCapabilities {
  mode: RuntimeMode;
  canSelectDirectory: boolean;
  canRestartBackend: boolean;
  hasEmbeddedShell: boolean;
  search: {
    enabled: boolean;
    provider: string;
    disabledReason: string;
  };
}

export function getRuntimeCapabilities(mode: RuntimeMode = getRuntimeMode()): RuntimeCapabilities {
  const appConfig = appConfigRepository.readAppConfig();

  // Merge with studio settings so the UI reflects user overrides
  let studioSearchEnabled: boolean | undefined;
  let studioTavilyApiKey = '';
  try {
    const settings = readJsonFile(STORAGE_PATHS.settingsFile, null) as Record<string, unknown> | null;
    const runtime = (settings?.runtime as Record<string, unknown>) || {};
    if (typeof runtime.searchEnabled === 'boolean') {
      studioSearchEnabled = runtime.searchEnabled;
    }
    studioTavilyApiKey = typeof runtime.tavilyApiKey === 'string' ? runtime.tavilyApiKey.trim() : '';
  } catch {
    // Fall through to appConfig only
  }

  const effectiveSearchEnabled = studioSearchEnabled !== undefined
    ? studioSearchEnabled
    : appConfig.search.enabled;
  const effectiveTavilyApiKey = studioTavilyApiKey || appConfig.search.providerConfig.tavilyApiKey;
  const searchEnabled = Boolean(effectiveSearchEnabled && effectiveTavilyApiKey);

  return {
    mode,
    canSelectDirectory: true,
    canRestartBackend: true,
    hasEmbeddedShell: mode === 'desktop',
    search: {
      enabled: searchEnabled,
      provider: appConfig.search.provider,
      disabledReason: searchEnabled ? '' : '当前未启用联网搜索',
    },
  };
}
