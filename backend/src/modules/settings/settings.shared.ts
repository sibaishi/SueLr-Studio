import type { DynamicValue } from '../types.ts';

function normalizeInteger(value: DynamicValue, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function cleanText(value: DynamicValue) {
  return String(value || '').trim();
}

export function normalizeModelOverrides(value: DynamicValue) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([modelId, config]: [string, DynamicValue]) => {
      const id = String(modelId || '').trim();
      if (!id || !config || typeof config !== 'object') return [];
      const type = ['chat', 'image', 'video'].includes(config.type) ? config.type : '';
      const endpoint = String(config.endpoint || '').trim();
      if (!type && !endpoint) return [];
      return [[id, { ...(type ? { type } : {}), ...(endpoint ? { endpoint } : {}) }]];
    }),
  );
}

export function sanitizeProviderConfig(providerConfig: DynamicValue = {}) {
  const imageEndpoint = cleanText(providerConfig.imageEndpoint) || '/v1/images/generations';

  return {
    authType: providerConfig.authType || 'bearer',
    chatEndpoint: providerConfig.chatEndpoint || '/v1/chat/completions',
    modelsEndpoint: providerConfig.modelsEndpoint || '/v1/models',
    imageEndpoint,
    imageEditEndpoint: providerConfig.imageEditEndpoint || '/v1/images/edits',
    imageTimeoutMs: normalizeInteger(providerConfig.imageTimeoutMs, 300000),
    videoEndpoint: providerConfig.videoEndpoint || '/v1/video/generations',
    ...(providerConfig.customHeaderName ? { customHeaderName: providerConfig.customHeaderName } : {}),
    ...(providerConfig.customPrefix !== undefined ? { customPrefix: providerConfig.customPrefix } : {}),
    modelOverrides: normalizeModelOverrides(providerConfig.modelOverrides),
  };
}
