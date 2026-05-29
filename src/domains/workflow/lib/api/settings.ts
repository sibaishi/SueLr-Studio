import type { ProjectModel } from '@/domains/workflow/lib/projectModels';
import { workflowApiFetch } from '@/domains/workflow/lib/api/base';

export async function fetchSettings() {
  return workflowApiFetch('/settings');
}

export async function updateSettings(data: Record<string, unknown>) {
  return workflowApiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function resetSettings() {
  return workflowApiFetch('/settings/reset', {
    method: 'POST',
  });
}

export async function testApiConnection(apiKey: string, baseUrl: string, providerConfig?: Record<string, unknown>) {
  return workflowApiFetch<{
    message: string;
    models: string[];
    categorized: { chat: string[]; image: string[]; video: string[] };
  }>('/settings/test-api', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

export async function discoverProviderModels(
  apiKey: string,
  baseUrl: string,
  providerConfig?: Record<string, unknown>,
) {
  return workflowApiFetch<CategorizedModels>('/settings/discover-models', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

export interface CategorizedModels {
  all: string[];
  chat: string[];
  image: string[];
  video: string[];
}

export async function fetchAvailableModels() {
  return workflowApiFetch<CategorizedModels>('/settings/models');
}

export interface SettingsPayload {
  apiKey?: string;
  tavilyApiKey?: string;
  baseUrl?: string;
  projectModels?: ProjectModel[];
  providerConfig?: Record<string, unknown>;
}
