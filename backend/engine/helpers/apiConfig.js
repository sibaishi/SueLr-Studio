import { normalizeProjectModels, resolveProjectModelRuntime } from './projectModels.js';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeProviderConfig(baseConfig, incomingConfig) {
  const base = cleanObject(baseConfig);
  const incoming = cleanObject(incomingConfig);
  const merged = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'modelOverrides') continue;
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }

  merged.modelOverrides = {
    ...cleanObject(base.modelOverrides),
    ...cleanObject(incoming.modelOverrides),
  };

  return merged;
}

const DEFAULT_RUNTIME_PROVIDER_CONFIG = {
  authType: 'bearer',
  modelsEndpoint: '/v1/models',
  chatEndpoint: '/v1/chat/completions',
  imageEndpoint: '/v1/images/generations',
  imageEditEndpoint: '/v1/images/edits',
  imageTimeoutMs: 300000,
  videoEndpoint: '/v1/video/generations',
  modelOverrides: {},
};

export function resolveRuntimeApiConfig(inputs, apiConfig) {
  const incoming = inputs?.apiKey;
  const globalProviderConfig = mergeProviderConfig(DEFAULT_RUNTIME_PROVIDER_CONFIG, apiConfig.providerConfig || {});
  const projectModels = normalizeProjectModels(apiConfig.projectModels || []);

  if (incoming && typeof incoming === 'object') {
    const nodeApiKey = cleanText(incoming.apiKey);
    const nodeBaseUrl = cleanText(incoming.baseUrl);
    const nodeModel = cleanText(incoming.model);
    const nodeEndpoint = cleanText(incoming.endpoint);
    const incomingProviderConfig = mergeProviderConfig(
      DEFAULT_RUNTIME_PROVIDER_CONFIG,
      incoming.providerConfig || {},
    );

    if (nodeModel && nodeEndpoint) {
      incomingProviderConfig.modelOverrides = {
        ...cleanObject(incomingProviderConfig.modelOverrides),
        [nodeModel]: {
          ...cleanObject(incomingProviderConfig.modelOverrides?.[nodeModel]),
          endpoint: nodeEndpoint,
        },
      };
    }

    return {
      apiKey: nodeApiKey,
      baseUrl: nodeBaseUrl,
      model: nodeModel,
      endpoint: nodeEndpoint,
      projectModels,
      providerConfig: incomingProviderConfig,
    };
  }

  const nodeApiKey = cleanText(incoming);
  return {
    apiKey: nodeApiKey || cleanText(apiConfig.apiKey),
    baseUrl: apiConfig.baseUrl,
    model: '',
    endpoint: '',
    projectModels,
    providerConfig: globalProviderConfig,
  };
}

export function getModelOverride(providerConfig, model) {
  const overrides = providerConfig?.modelOverrides;
  if (!overrides || !model) return {};
  return overrides[String(model)] || {};
}

export function resolveModelRuntime(runtimeConfig, modelId, options = {}) {
  const overrideEndpoint = cleanText(runtimeConfig?.endpoint);
  if (overrideEndpoint) {
    return {
      endpoint: overrideEndpoint,
      model: { modelId: cleanText(modelId), type: options.expectedType || '', configured: true },
      source: 'override',
    };
  }

  const { model, endpoint } = resolveProjectModelRuntime({
    projectModels: runtimeConfig?.projectModels || [],
    modelId,
    expectedType: options.expectedType,
    purpose: options.purpose,
  });

  return { model, endpoint, source: 'project-model' };
}
