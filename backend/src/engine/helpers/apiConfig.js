import { DEFAULT_ENDPOINTS, normalizeProjectModels, resolveProjectModelRuntime } from './projectModels.js';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const NODE_ENDPOINT_CATEGORIES = new Set(['chat', 'image', 'image-edit', 'gemini-generate-content', 'video']);

function normalizeEndpointMode(value) {
  return value === 'custom' ? 'custom' : 'category';
}

function normalizeEndpointCategory(value) {
  return NODE_ENDPOINT_CATEGORIES.has(value) ? value : 'chat';
}

export function resolveNodeEndpoint({
  modelId = '',
  endpointMode,
  endpointCategory,
  customEndpoint,
  legacyEndpoint,
}) {
  const mode = normalizeEndpointMode(endpointMode);
  const normalizedLegacyEndpoint = cleanText(legacyEndpoint);

  if (mode === 'custom') {
    return cleanText(customEndpoint) || normalizedLegacyEndpoint;
  }

  const category = normalizeEndpointCategory(endpointCategory);
  if (category === 'gemini-generate-content') {
    const resolvedModelId = cleanText(modelId);
    return resolvedModelId ? `/v1beta/models/${encodeURIComponent(resolvedModelId)}:generateContent` : '';
  }

  return DEFAULT_ENDPOINTS[category] || '';
}

function parseRoutedModel(value) {
  const text = cleanText(value);
  const separatorIndex = text.indexOf('::');
  if (separatorIndex <= 0) return { configId: '', modelId: text };
  return {
    configId: text.slice(0, separatorIndex),
    modelId: text.slice(separatorIndex + 2),
  };
}

function findRuntimeConfig(apiConfig, configId) {
  if (!configId || !Array.isArray(apiConfig?.configs)) return null;
  return apiConfig.configs.find((config) => cleanText(config?.id) === configId) || null;
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

export function resolveRuntimeApiConfig(inputs, apiConfig, selectedModel = '') {
  const incoming = inputs?.apiKey;
  const routedModel = parseRoutedModel(selectedModel);
  const routedConfig = findRuntimeConfig(apiConfig, routedModel.configId);
  const sourceConfig = routedConfig || apiConfig || {};
  const globalProviderConfig = mergeProviderConfig(DEFAULT_RUNTIME_PROVIDER_CONFIG, sourceConfig.providerConfig || {});
  const projectModels = normalizeProjectModels(sourceConfig.projectModels || []);

  if (incoming && typeof incoming === 'object') {
    const nodeApiKey = cleanText(incoming.apiKey);
    const nodeBaseUrl = cleanText(incoming.baseUrl);
    const nodeModel = cleanText(incoming.model);
    const nodeEndpointMode = normalizeEndpointMode(incoming.endpointMode);
    const nodeEndpointCategory = normalizeEndpointCategory(incoming.endpointCategory);
    const nodeCustomEndpoint = cleanText(incoming.customEndpoint);
    const nodeEndpoint = resolveNodeEndpoint({
      modelId: nodeModel,
      endpointMode: nodeEndpointMode,
      endpointCategory: nodeEndpointCategory,
      customEndpoint: nodeCustomEndpoint,
      legacyEndpoint: incoming.endpoint,
    });
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
      endpointMode: nodeEndpointMode,
      endpointCategory: nodeEndpointCategory,
      customEndpoint: nodeCustomEndpoint || cleanText(incoming.endpoint),
      projectModels,
      providerConfig: incomingProviderConfig,
      workflowExecution: apiConfig?.workflowExecution,
    };
  }

  const nodeApiKey = cleanText(incoming);
  return {
    apiKey: nodeApiKey || cleanText(sourceConfig.apiKey),
    baseUrl: sourceConfig.baseUrl || sourceConfig.base,
    model: routedModel.modelId,
    endpoint: '',
    projectModels,
    providerConfig: globalProviderConfig,
    workflowExecution: apiConfig?.workflowExecution,
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
