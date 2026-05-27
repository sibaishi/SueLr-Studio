import { adminConfigRepository } from '../../modules/admin-config/admin-config.repository.ts';
import { type RuntimeMode, getRuntimeMode, isServerRuntimeMode } from './mode.ts';

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
  adminConsole: {
    enabled: boolean;
    requiresAccessKey: boolean;
    configured: boolean;
  };
}

export function getRuntimeCapabilities(mode: RuntimeMode = getRuntimeMode()): RuntimeCapabilities {
  const serverMode = isServerRuntimeMode(mode);
  const adminConfig = adminConfigRepository.readAdminConfig();
  const adminAccessKey = String(process.env.APP_ADMIN_ACCESS_KEY || '').trim();

  return {
    mode,
    canSelectDirectory: !serverMode,
    canRestartBackend: !serverMode,
    hasEmbeddedShell: mode === 'desktop',
    search: {
      enabled: Boolean(adminConfig.search.enabled && adminConfig.search.providerConfig.tavilyApiKey),
      provider: adminConfig.search.provider,
      disabledReason: adminConfig.search.enabled ? '' : '当前部署未启用联网搜索',
    },
    adminConsole: {
      enabled: Boolean(adminConfig.features.adminConsoleEnabled),
      requiresAccessKey: serverMode,
      configured: !serverMode || Boolean(adminAccessKey),
    },
  };
}
