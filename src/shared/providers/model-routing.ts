import type { ApiConfig, ModelInfo, ProviderConfig } from '@/shared/types';
import type { ApiConfigPayload } from '@/shared/api/capabilities';

export function getModelDisplayName(model: ModelInfo) {
  return model.modelId || model.id;
}

export function getModelGroupName(model: ModelInfo) {
  return model.configName || model.configId || '默认 API 配置';
}

export function resolveSelectedModel(models: ModelInfo[], selected: string) {
  return models.find((model) => model.id === selected)
    || models.find((model) => model.modelId === selected)
    || null;
}

export function resolveProviderModelId(models: ModelInfo[], selected: string) {
  const routed = resolveSelectedModel(models, selected);
  return routed?.modelId || selected;
}

export function resolveModelConfig(apiConfigs: ApiConfig[], model: ModelInfo | null) {
  if (!model?.configId) return null;
  return apiConfigs.find((config) => config.id === model.configId) || null;
}

export function buildApiConfigPayload(
  config: ApiConfig | null,
  fallback: {
    apiKey: string;
    baseUrl: string;
    providerConfig?: ProviderConfig;
  },
): ApiConfigPayload {
  return {
    apiKey: config?.apiKey || fallback.apiKey,
    baseUrl: config?.base || fallback.baseUrl,
    providerConfig: config?.providerConfig || fallback.providerConfig,
    projectModels: config?.projectModels,
  };
}
