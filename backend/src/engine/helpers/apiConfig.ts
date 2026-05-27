import { DEFAULT_ENDPOINTS, normalizeProjectModels, resolveProjectModelRuntime } from './projectModels.js';
import type { EndpointCategory, EndpointMode, ProjectModel, ProjectModelType } from './projectModels.js';

type PlainObject = Record<string, unknown>;

interface RuntimeProviderConfig extends PlainObject {
  modelOverrides?: Record<string, PlainObject>;
}

interface RuntimeApiConfig extends PlainObject {
  apiKey?: unknown;
  base?: unknown;
  baseUrl?: unknown;
  configs?: RuntimeApiConfig[];
  id?: unknown;
  projectModels?: unknown;
  providerConfig?: RuntimeProviderConfig;
  workflowExecution?: unknown;
}

interface RuntimeInputs {
  apiKey?: unknown;
}

interface NodeApiKeyConfig {
  apiKey?: unknown;
  baseUrl?: unknown;
  customEndpoint?: unknown;
  endpoint?: unknown;
  endpointCategory?: unknown;
  endpointMode?: unknown;
  model?: unknown;
  providerConfig?: RuntimeProviderConfig;
}

interface ResolveNodeEndpointOptions {
  modelId?: unknown;
  endpointMode?: unknown;
  endpointCategory?: unknown;
  customEndpoint?: unknown;
  legacyEndpoint?: unknown;
}

interface ResolveModelRuntimeOptions {
  expectedType?: ProjectModelType;
  purpose?: EndpointCategory;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function cleanObject(value: unknown): PlainObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as PlainObject) : {};
}

const NODE_ENDPOINT_CATEGORIES = new Set(['chat', 'image', 'image-edit', 'gemini-generate-content', 'video']);

function normalizeEndpointMode(value: unknown): EndpointMode {
  return value === 'custom' ? 'custom' : 'category';
}

function normalizeEndpointCategory(value: unknown): EndpointCategory {
  return typeof value === 'string' && NODE_ENDPOINT_CATEGORIES.has(value) ? (value as EndpointCategory) : 'chat';
}

export function resolveNodeEndpoint({
  modelId = '',
  endpointMode,
  endpointCategory,
  customEndpoint,
  legacyEndpoint,
}: ResolveNodeEndpointOptions): string {
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

function parseRoutedModel(value: unknown): { configId: string; modelId: string } {
  const text = cleanText(value);
  const separatorIndex = text.indexOf('::');
  if (separatorIndex <= 0) return { configId: '', modelId: text };
  return {
    configId: text.slice(0, separatorIndex),
    modelId: text.slice(separatorIndex + 2),
  };
}

function findRuntimeConfig(apiConfig: RuntimeApiConfig | undefined, configId: string): RuntimeApiConfig | null {
  if (!configId || !Array.isArray(apiConfig?.configs)) return null;
  return apiConfig.configs.find((config) => cleanText(config?.id) === configId) || null;
}

function mergeProviderConfig(baseConfig: unknown, incomingConfig: unknown): RuntimeProviderConfig {
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

export function resolveRuntimeApiConfig(
  inputs: RuntimeInputs | undefined,
  apiConfig: RuntimeApiConfig | undefined,
  selectedModel: unknown = '',
) {
  const incoming = inputs?.apiKey;
  const routedModel = parseRoutedModel(selectedModel);
  const routedConfig = findRuntimeConfig(apiConfig, routedModel.configId);
  const sourceConfig = routedConfig || apiConfig || {};
  const globalProviderConfig = mergeProviderConfig(DEFAULT_RUNTIME_PROVIDER_CONFIG, sourceConfig.providerConfig || {});
  const projectModels = normalizeProjectModels(sourceConfig.projectModels || []);

  if (incoming && typeof incoming === 'object') {
    const nodeConfig = incoming as NodeApiKeyConfig;
    const nodeApiKey = cleanText(nodeConfig.apiKey);
    const nodeBaseUrl = cleanText(nodeConfig.baseUrl);
    const nodeModel = cleanText(nodeConfig.model);
    const nodeEndpointMode = normalizeEndpointMode(nodeConfig.endpointMode);
    const nodeEndpointCategory = normalizeEndpointCategory(nodeConfig.endpointCategory);
    const nodeCustomEndpoint = cleanText(nodeConfig.customEndpoint);
    const nodeEndpoint = resolveNodeEndpoint({
      modelId: nodeModel,
      endpointMode: nodeEndpointMode,
      endpointCategory: nodeEndpointCategory,
      customEndpoint: nodeCustomEndpoint,
      legacyEndpoint: nodeConfig.endpoint,
    });
    const incomingProviderConfig = mergeProviderConfig(
      DEFAULT_RUNTIME_PROVIDER_CONFIG,
      nodeConfig.providerConfig || {},
    );

    if (nodeModel && nodeEndpoint) {
      incomingProviderConfig.modelOverrides = {
        ...(incomingProviderConfig.modelOverrides || {}),
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
      customEndpoint: nodeCustomEndpoint || cleanText(nodeConfig.endpoint),
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

export function getModelOverride(providerConfig: RuntimeProviderConfig | undefined, model: unknown): PlainObject {
  const overrides = providerConfig?.modelOverrides;
  if (!overrides || !model) return {};
  return overrides[String(model)] || {};
}

export function resolveModelRuntime(
  runtimeConfig: RuntimeApiConfig | undefined,
  modelId: unknown,
  options: ResolveModelRuntimeOptions = {},
): {
  endpoint: string;
  model: ProjectModel | { modelId: string; type: ProjectModelType | ''; configured: true };
  source: string;
} {
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
