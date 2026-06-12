import { appConfigRepository } from '../../modules/app-config/app-config.repository.ts';
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

  return {
    mode,
    canSelectDirectory: true,
    canRestartBackend: true,
    hasEmbeddedShell: mode === 'desktop',
    search: {
      enabled: Boolean(appConfig.search.enabled && appConfig.search.providerConfig.tavilyApiKey),
      provider: appConfig.search.provider,
      disabledReason: appConfig.search.enabled ? '' : '当前未启用联网搜索',
    },
  };
}
