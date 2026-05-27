const MODEL_TYPES = new Set(['chat', 'image', 'video']);
const ENDPOINT_MODES = new Set(['category', 'custom']);
const ENDPOINT_CATEGORIES = new Set(['chat', 'image', 'image-edit', 'gemini-generate-content', 'video']);

export type ProjectModelType = 'chat' | 'image' | 'video';
export type EndpointMode = 'category' | 'custom';
export type EndpointCategory = 'chat' | 'image' | 'image-edit' | 'gemini-generate-content' | 'video';

export interface ProjectModel {
  id: string;
  modelId: string;
  enabled: boolean;
  type: ProjectModelType | '';
  endpointMode: EndpointMode;
  endpointCategory: EndpointCategory | '';
  customEndpoint: string;
  source: 'imported' | 'manual';
  configured: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ProjectModelInput {
  id?: unknown;
  modelId?: unknown;
  enabled?: unknown;
  type?: unknown;
  endpointMode?: unknown;
  endpointCategory?: unknown;
  customEndpoint?: unknown;
  source?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface ProjectModelSettings {
  projectModels?: unknown;
  providerConfig?: {
    modelOverrides?: Record<string, ProjectModelOverride>;
  };
}

type ProjectModelOverride = {
  type?: unknown;
  endpoint?: unknown;
};

export const DEFAULT_ENDPOINTS = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  'image-edit': '/v1/images/edits',
  'gemini-generate-content': null,
  video: '/v1/video/generations',
};

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function canonicalModelKey(value: unknown): string {
  return cleanText(value)
    .replace(/\s*-\s*/g, '-')
    .toLowerCase();
}

function cleanTimestamp(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : Date.now();
}

export function categorizeLegacyModel(modelId: unknown): ProjectModelType {
  const lower = cleanText(modelId).toLowerCase();
  if (/seedance|cogvideo|runway|sora|video|animate|kling/i.test(lower)) return 'video';
  if (/seedream|dall|stable.?diffusion|midjourney|sdxl|flux|cogview|image|banana|wanx/i.test(lower)) return 'image';
  return 'chat';
}

export function inferEndpointCategory(type: unknown): EndpointCategory | '' {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'chat') return 'chat';
  return '';
}

function normalizeEndpointMode(value: unknown): EndpointMode {
  return typeof value === 'string' && ENDPOINT_MODES.has(value) ? (value as EndpointMode) : 'category';
}

export function normalizeProjectModel(value: unknown): ProjectModel | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as ProjectModelInput;

  const id = cleanText(item.id || item.modelId);
  const modelId = cleanText(item.modelId || item.id);
  if (!id || !modelId) return null;

  const type = typeof item.type === 'string' && MODEL_TYPES.has(item.type) ? (item.type as ProjectModelType) : '';
  const endpointMode = normalizeEndpointMode(item.endpointMode);
  const endpointCategory =
    typeof item.endpointCategory === 'string' && ENDPOINT_CATEGORIES.has(item.endpointCategory)
      ? (item.endpointCategory as EndpointCategory)
      : inferEndpointCategory(type);
  const customEndpoint = cleanText(item.customEndpoint);
  const enabled = item.enabled !== false;
  const source = item.source === 'manual' ? 'manual' : 'imported';
  const createdAt = cleanTimestamp(item.createdAt);
  const updatedAt = cleanTimestamp(item.updatedAt);
  const configured = Boolean(
    enabled &&
      type &&
      ((endpointMode === 'category' && endpointCategory) || (endpointMode === 'custom' && customEndpoint)),
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

export function normalizeProjectModels(value: unknown): ProjectModel[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, ProjectModel>();
  for (const item of value) {
    const normalized = normalizeProjectModel(item);
    if (!normalized) continue;
    deduped.set(normalized.modelId, normalized);
  }
  return Array.from(deduped.values()).sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export function createProjectModelFromLegacy(
  modelId: unknown,
  override: ProjectModelOverride = {},
  fallbackType: unknown = '',
): ProjectModel | null {
  const id = cleanText(modelId);
  if (!id) return null;

  const type =
    typeof override.type === 'string' && MODEL_TYPES.has(override.type)
      ? (override.type as ProjectModelType)
      : typeof fallbackType === 'string' && MODEL_TYPES.has(fallbackType)
        ? (fallbackType as ProjectModelType)
        : categorizeLegacyModel(id);
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

export function migrateProjectModels(settings: ProjectModelSettings = {}): ProjectModel[] {
  const currentModels = normalizeProjectModels(settings.projectModels);
  if (currentModels.length > 0) return currentModels;

  const legacyOverrides = settings.providerConfig?.modelOverrides || {};
  const ids = new Set(Object.keys(legacyOverrides));

  return Array.from(ids)
    .map((modelId) => createProjectModelFromLegacy(modelId, legacyOverrides[modelId]))
    .filter((model): model is ProjectModel => Boolean(model))
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export function groupConfiguredProjectModels(projectModels: unknown): Record<'all' | ProjectModelType, string[]> {
  const groups: Record<'all' | ProjectModelType, string[]> = { all: [], chat: [], image: [], video: [] };
  for (const model of normalizeProjectModels(projectModels)) {
    if (!model.configured) continue;
    groups.all.push(model.modelId);
    if (model.type === 'chat') groups.chat.push(model.modelId);
    if (model.type === 'image') groups.image.push(model.modelId);
    if (model.type === 'video') groups.video.push(model.modelId);
  }
  return groups;
}

export function findProjectModel(projectModels: unknown, modelId: unknown): ProjectModel | null {
  const id = cleanText(modelId);
  if (!id) return null;
  const canonicalId = canonicalModelKey(id);
  return (
    normalizeProjectModels(projectModels).find(
      (item) => item.modelId === id || canonicalModelKey(item.modelId) === canonicalId,
    ) || null
  );
}

export function resolveProjectModelRuntime({
  projectModels,
  modelId,
  expectedType,
  purpose,
}: {
  projectModels: unknown;
  modelId: unknown;
  expectedType?: ProjectModelType;
  purpose?: EndpointCategory;
}): { model: ProjectModel; endpoint: string } {
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
      : model.endpointCategory || purpose || inferEndpointCategory(model.type);

  const endpoint = DEFAULT_ENDPOINTS[resolvedCategory as EndpointCategory];
  if (resolvedCategory === 'gemini-generate-content') {
    return { model, endpoint: `/v1beta/models/${encodeURIComponent(model.modelId)}:generateContent` };
  }
  if (!endpoint) {
    throw new Error(`模型缺少可用接口配置：${modelId}`);
  }

  return { model, endpoint };
}
