import { apiRequest, getApiErrorMessage, setBackendAvailable, isBackendAvailable, selectDirectory, getRuntimeCapabilities } from '@/shared/api';
import { getCachedRuntimeCapabilities, setCachedRuntimeCapabilities } from '@/shared/api/serverState';
import {
  clearBrowserDownloadDirectory,
  isBrowserDownloadDirectorySupported,
  loadBrowserDownloadDirectoryMeta,
  pickBrowserDownloadDirectory,
} from '@/shared/runtime/browserDownload';
import type { ModelInfo } from '@/shared/types';
import type { RuntimeCapabilities } from '@/shared/runtime';
import type { AccountDetailsLogsPayload, AccountDetailsPayload, BackendRestartPayload, BackendStatusPayload, ClientDownloadDirectoryState, StorageSettingsPayload, StudioSettingsPayload } from './types';

type BackendModelsData = {
  message?: string;
  models?: string[];
  categorized?: { chat?: string[]; image?: string[]; video?: string[] };
};

function modelsFromBackend(
  all: string[] = [],
  categorized: { chat?: string[]; image?: string[]; video?: string[] } = {},
): ModelInfo[] {
  const categoryById = new Map<string, ModelInfo['cat']>();
  for (const id of categorized.chat || []) categoryById.set(id, 'chat');
  for (const id of categorized.image || []) categoryById.set(id, 'image');
  for (const id of categorized.video || []) categoryById.set(id, 'video');

  return all.map((id) => ({
    id,
    cat: categoryById.get(id) || 'chat',
  }));
}

export function isSettingsServerAvailable() {
  return isBackendAvailable();
}

export async function checkSettingsServer(): Promise<boolean> {
  const result = await apiRequest<BackendStatusPayload>('/api/status', { timeoutMs: 2000 });
  const payload = result.data as ({ ok?: boolean } | undefined);
  const available = Boolean(payload?.ok ?? ((payload as { data?: { ok?: boolean } } | undefined)?.data?.ok));
  setBackendAvailable(available);
  if (result.data?.runtime) {
    setCachedRuntimeCapabilities(result.data.runtime);
  }
  return available;
}

export async function getBackendStatus(timeoutMs = 2000): Promise<BackendStatusPayload | null> {
  const result = await apiRequest<BackendStatusPayload>('/api/status', { timeoutMs });
  if (!result.success || !result.data?.ok) {
    setBackendAvailable(false);
    setCachedRuntimeCapabilities(null);
    return null;
  }
  setBackendAvailable(true);
  if (result.data.runtime) {
    setCachedRuntimeCapabilities(result.data.runtime);
  }
  return result.data;
}

export async function loadRuntimeCapabilities(): Promise<RuntimeCapabilities | null> {
  if (!isBackendAvailable()) return null;
  const runtime = await getRuntimeCapabilities().catch(() => null);
  setCachedRuntimeCapabilities(runtime);
  return runtime;
}

export function getRuntimeCapabilitiesSnapshot(): RuntimeCapabilities | null {
  return getCachedRuntimeCapabilities();
}

export async function loadStudioSettings(): Promise<StudioSettingsPayload | null> {
  if (!isBackendAvailable()) return null;
  const result = await apiRequest<StudioSettingsPayload>('/api/settings/studio');
  return result.success && result.data ? result.data : null;
}

export async function saveStudioSettings(settings: StudioSettingsPayload): Promise<void> {
  if (!isBackendAvailable()) return;
  const sanitizedConfigs = (settings.runtime.configs || []).map((config) => ({
    ...config,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  }));
  const payload: StudioSettingsPayload = {
    ...settings,
    runtime: {
      ...settings.runtime,
      configs: sanitizedConfigs,
    },
  };
  await apiRequest('/api/settings/studio', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function loadStorageSettings(): Promise<StorageSettingsPayload | null> {
  if (!isBackendAvailable()) return null;
  const result = await apiRequest<StorageSettingsPayload>('/api/settings/storage');
  return result.success && result.data ? result.data : null;
}

export async function saveStorageSettings(customRoot: string): Promise<StorageSettingsPayload> {
  const result = await apiRequest<StorageSettingsPayload>('/api/settings/storage', {
    method: 'PUT',
    body: JSON.stringify({ customRoot }),
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '外部路径保存失败');
  }
  return result.data;
}

export async function resetStorageSettings(): Promise<StorageSettingsPayload> {
  const result = await apiRequest<StorageSettingsPayload>('/api/settings/storage/reset', {
    method: 'POST',
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '外部路径恢复默认失败');
  }
  return result.data;
}

export async function pickStorageDirectory(): Promise<string | null> {
  if (!isBackendAvailable()) return null;
  return selectDirectory();
}

export function loadClientDownloadDirectoryState(): ClientDownloadDirectoryState | null {
  const meta = loadBrowserDownloadDirectoryMeta();
  return meta ? { ...meta, supported: isBrowserDownloadDirectorySupported() } : null;
}

export async function pickClientDownloadDirectory(): Promise<ClientDownloadDirectoryState> {
  const meta = await pickBrowserDownloadDirectory();
  return { ...meta, supported: isBrowserDownloadDirectorySupported() };
}

export async function resetClientDownloadDirectory(): Promise<void> {
  await clearBrowserDownloadDirectory();
}

export async function restartBackendRequest(): Promise<BackendRestartPayload> {
  const result = await apiRequest<BackendRestartPayload>('/api/settings/restart-backend', {
    method: 'POST',
  });
  if (!result.success) {
    throw new Error(result.error || '后端重启失败');
  }
  return result.data || {};
}

export async function loadAccountDetails(): Promise<AccountDetailsPayload | null> {
  const result = await apiRequest<AccountDetailsPayload>('/api/settings/account-details');
  setBackendAvailable(Boolean(result.success));
  return result.success && result.data ? result.data : null;
}

export async function saveAccountDetails(username: string, password: string): Promise<AccountDetailsPayload> {
  const result = await apiRequest<AccountDetailsPayload>('/api/settings/account-details', {
    method: 'PUT',
    body: JSON.stringify({ username, password }),
    timeoutMs: 20000,
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '账号登录失败');
  }
  return result.data;
}

export async function refreshAccountDetails(): Promise<AccountDetailsPayload> {
  const result = await apiRequest<AccountDetailsPayload>('/api/settings/account-details/refresh', {
    method: 'POST',
    timeoutMs: 20000,
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '账号明细刷新失败');
  }
  return result.data;
}

export async function clearAccountDetails(): Promise<AccountDetailsPayload> {
  const result = await apiRequest<AccountDetailsPayload>('/api/settings/account-details', {
    method: 'DELETE',
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '账号清除失败');
  }
  return result.data;
}

export async function loadAccountDetailsLogs(page = 1, pageSize = 20): Promise<AccountDetailsLogsPayload> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const result = await apiRequest<AccountDetailsLogsPayload>(`/api/settings/account-details/logs?${params.toString()}`, {
    timeoutMs: 20000,
  });
  if (!result.success || !result.data) {
    throw new Error(result.error || '账号日志加载失败');
  }
  return result.data;
}


type WaitForBackendReadyOptions = {
  previousProcessInstanceId?: string;
  timeoutMs?: number;
  intervalMs?: number;
};

export async function waitForBackendReady(options: WaitForBackendReadyOptions = {}): Promise<BackendStatusPayload> {
  const { previousProcessInstanceId, timeoutMs = 20000, intervalMs = 500 } = options;
  const startedAt = Date.now();
  let sawBackendOffline = false;

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getBackendStatus(1500).catch(() => null);
    if (status?.ok) {
      if (!previousProcessInstanceId || status.processInstanceId !== previousProcessInstanceId || sawBackendOffline) {
        return status;
      }
    } else {
      sawBackendOffline = true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('等待后端重启完成超时');
}

export async function discoverProviderModels(
  apiKey: string,
  baseUrl: string,
  configId?: string,
  providerConfig?: Record<string, unknown>,
) {
  return apiRequest<{ all: string[]; chat: string[]; image: string[]; video: string[] }>('/api/settings/discover-models', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, configId, providerConfig }),
  });
}

export async function testSettingsConnection(
  apiKey: string,
  baseUrl: string,
  configId?: string,
  providerConfig?: Record<string, unknown>,
): Promise<{ success: boolean; models: ModelInfo[]; message?: string; error?: string }> {
  if (!isBackendAvailable()) return { success: false, models: [], error: '本地后端服务未连接' };

  try {
    const result = await apiRequest<BackendModelsData>('/api/settings/test-api', {
      method: 'POST',
      body: JSON.stringify({ apiKey, baseUrl, configId, providerConfig }),
    });
    return {
      success: result.success,
      models: modelsFromBackend(result.data?.models || [], result.data?.categorized || {}),
      message: result.data?.message,
      error: result.success ? undefined : result.error || '连接测试失败',
    };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: getApiErrorMessage(error, '模型获取失败'),
    };
  }
}
