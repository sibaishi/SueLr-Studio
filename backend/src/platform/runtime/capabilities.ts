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
  let searchEnabledSetting = false;
  let tavilyApiKey = '';
  try {
    const settings = readJsonFile(STORAGE_PATHS.settingsFile, null) as Record<string, unknown> | null;
    const runtime = (settings?.runtime as Record<string, unknown>) || {};
    searchEnabledSetting = runtime.searchEnabled === true;
    tavilyApiKey = typeof runtime.tavilyApiKey === 'string' ? runtime.tavilyApiKey.trim() : '';
  } catch {
    // Settings are optional during first launch.
  }

  const searchEnabled = Boolean(searchEnabledSetting && tavilyApiKey);

  return {
    mode,
    canSelectDirectory: true,
    canRestartBackend: true,
    hasEmbeddedShell: mode === 'desktop',
    search: {
      enabled: searchEnabled,
      provider: 'tavily',
      disabledReason: searchEnabled ? '' : '当前未启用联网搜索',
    },
  };
}
