const MODEL_TYPES = new Set(['chat', 'image', 'video']);
const ENDPOINT_MODES = new Set(['category', 'custom']);
const ENDPOINT_CATEGORIES = new Set(['chat', 'image', 'image-edit', 'video']);

export const DEFAULT_ENDPOINTS = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  'image-edit': '/v1/images/edits',
  video: '/v1/video/generations',
};

function cleanText(value) {
  return String(value || '').trim();
}

function cleanTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : Date.now();
}

export function categorizeLegacyModel(modelId) {
  const lower = cleanText(modelId).toLowerCase();
  if (/seedance|cogvideo|runway|sora|video|animate|kling/i.test(lower)) return 'video';
  if (/seedream|dall|stable.?diffusion|midjourney|sdxl|flux|cogview|image|banana|wanx/i.test(lower)) return 'image';
  return 'chat';
}

export function inferEndpointCategory(type) {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'chat') return 'chat';
  return '';
}

function normalizeEndpointMode(value) {
  return ENDPOINT_MODES.has(value) ? value : 'category';
}

export function normalizeProjectModel(value) {
  if (!value || typeof value !== 'object') return null;

  const id = cleanText(value.id || value.modelId);
  const modelId = cleanText(value.modelId || value.id);
  if (!id || !modelId) return null;

  const type = MODEL_TYPES.has(value.type) ? value.type : '';
  const endpointMode = normalizeEndpointMode(value.endpointMode);
  const endpointCategory = ENDPOINT_CATEGORIES.has(value.endpointCategory)
    ? value.endpointCategory
    : inferEndpointCategory(type);
  const customEndpoint = cleanText(value.customEndpoint);
  const enabled = value.enabled !== false;
  const source = value.source === 'manual' ? 'manual' : 'imported';
  const createdAt = cleanTimestamp(value.createdAt);
  const updatedAt = cleanTimestamp(value.updatedAt);
  const configured = Boolean(
    enabled &&
    type &&
    (
      (endpointMode === 'category' && endpointCategory) ||
      (endpointMode === 'custom' && customEndpoint)
    )
  );

  return {
    id,
    modelId,
    enabled,
    type,
    endpointMode,
    endpointCategory: endpointMode === 'category' ? endpointCategory : '',
    customEndpoint: endpointMode === 'custom' ? customEndpoint : '',
    source,
    configured,
    createdAt,
    updatedAt,
  };
}

export function normalizeProjectModels(value) {
  if (!Array.isArray(value)) return [];

  const deduped = new Map();
  for (const item of value) {
    const normalized = normalizeProjectModel(item);
    if (!normalized) continue;
    deduped.set(normalized.modelId, normalized);
  }
  return Array.from(deduped.values()).sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export function createProjectModelFromLegacy(modelId, override = {}, fallbackType = '') {
  const id = cleanText(modelId);
  if (!id) return null;

  const type = MODEL_TYPES.has(override.type)
    ? override.type
    : (MODEL_TYPES.has(fallbackType) ? fallbackType : categorizeLegacyModel(id));
  const customEndpoint = cleanText(override.endpoint);
  const endpointMode = customEndpoint ? 'custom' : 'category';

  return normalizeProjectModel({
    id,
    modelId: id,
    enabled: true,
    type,
    endpointMode,
    endpointCategory: inferEndpointCategory(type),
    customEndpoint,
    source: 'imported',
  });
}

export function migrateProjectModels(settings = {}) {
  const currentModels = normalizeProjectModels(settings.projectModels);
  if (currentModels.length > 0) return currentModels;

  const legacyOverrides = settings.providerConfig?.modelOverrides || {};
  const ids = new Set(Object.keys(legacyOverrides));

  return Array.from(ids)
    .map((modelId) => createProjectModelFromLegacy(modelId, legacyOverrides[modelId]))
    .filter(Boolean)
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export function groupConfiguredProjectModels(projectModels) {
  const groups = { all: [], chat: [], image: [], video: [] };
  for (const model of normalizeProjectModels(projectModels)) {
    if (!model.configured) continue;
    groups.all.push(model.modelId);
    if (model.type === 'chat') groups.chat.push(model.modelId);
    if (model.type === 'image') groups.image.push(model.modelId);
    if (model.type === 'video') groups.video.push(model.modelId);
  }
  return groups;
}

export function findProjectModel(projectModels, modelId) {
  const id = cleanText(modelId);
  if (!id) return null;
  return normalizeProjectModels(projectModels).find((item) => item.modelId === id) || null;
}

export function resolveProjectModelRuntime({ projectModels, modelId, expectedType, purpose }) {
  const model = findProjectModel(projectModels, modelId);
  if (!model || !model.configured) {
    throw new Error(`模型未完成配置或不存在：${modelId}`);
  }
  if (expectedType && model.type !== expectedType) {
    throw new Error(`模型类型不匹配：${modelId} 不是 ${expectedType} 模型`);
  }

  if (model.endpointMode === 'custom') {
    return { model, endpoint: model.customEndpoint };
  }

  const resolvedCategory =
    purpose === 'image-edit' && model.endpointCategory === 'image'
      ? 'image-edit'
      : (model.endpointCategory || purpose || inferEndpointCategory(model.type));

  const endpoint = DEFAULT_ENDPOINTS[resolvedCategory];
  if (!endpoint) {
    throw new Error(`模型缺少可用接口配置：${modelId}`);
  }

  return { model, endpoint };
}
