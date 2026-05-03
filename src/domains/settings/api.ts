import { apiRequest, getApiErrorMessage, setBackendAvailable, isBackendAvailable } from '@/shared/api';
import type { ModelInfo } from '@/lib/types';
import type { StudioSettingsPayload } from './types';

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
  const result = await apiRequest<{ ok?: boolean }>('/api/status', { timeoutMs: 2000 });
  const payload = result.data as ({ ok?: boolean } | undefined);
  const available = Boolean(payload?.ok ?? ((payload as { data?: { ok?: boolean } } | undefined)?.data?.ok));
  setBackendAvailable(available);
  return available;
}

export async function loadStudioSettings(): Promise<StudioSettingsPayload | null> {
  if (!isBackendAvailable()) return null;
  const result = await apiRequest<StudioSettingsPayload>('/api/settings/studio');
  return result.success && result.data ? result.data : null;
}

export async function saveStudioSettings(settings: StudioSettingsPayload): Promise<void> {
  if (!isBackendAvailable()) return;
  const payload: StudioSettingsPayload = {
    ...settings,
    runtime: {
      ...settings.runtime,
      ...(settings.runtime.tavilyApiKey ? { tavilyApiKey: settings.runtime.tavilyApiKey } : {}),
    },
  };
  await apiRequest('/api/settings/studio', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function discoverProviderModels(
  apiKey: string,
  baseUrl: string,
  providerConfig?: Record<string, unknown>,
) {
  return apiRequest<{ all: string[]; chat: string[]; image: string[]; video: string[] }>('/api/settings/discover-models', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

export async function testSettingsConnection(
  apiKey: string,
  baseUrl: string,
  providerConfig?: Record<string, unknown>,
): Promise<{ success: boolean; models: ModelInfo[]; message?: string; error?: string }> {
  if (!isBackendAvailable()) return { success: false, models: [], error: '本地后端服务未连接' };

  try {
    const result = await apiRequest<BackendModelsData>('/api/settings/test-api', {
      method: 'POST',
      body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
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
