export type ProjectModelType = 'chat' | 'image' | 'video' | '';
export type ProjectModelEndpointMode = 'category' | 'custom';
export type ProjectModelEndpointCategory = 'chat' | 'image' | 'image-edit' | 'video' | '';

export type ProjectModel = {
  id: string;
  modelId: string;
  enabled: boolean;
  type: ProjectModelType;
  endpointMode: ProjectModelEndpointMode;
  endpointCategory: ProjectModelEndpointCategory;
  customEndpoint: string;
  source: 'imported' | 'manual';
  configured: boolean;
  createdAt: number;
  updatedAt: number;
};

type CategorizedModels = {
  all: string[];
  chat: string[];
  image: string[];
  video: string[];
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function inferEndpointCategory(type: ProjectModelType): ProjectModelEndpointCategory {
  if (type === 'chat') return 'chat';
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  return '';
}

function cleanTimestamp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : Date.now();
}

export function normalizeProjectModel(value: unknown): ProjectModel | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<ProjectModel>;
  const id = cleanText(record.id || record.modelId);
  const modelId = cleanText(record.modelId || record.id);
  if (!id || !modelId) return null;

  const type: ProjectModelType = record.type === 'chat' || record.type === 'image' || record.type === 'video'
    ? record.type
    : '';
  const endpointMode: ProjectModelEndpointMode = record.endpointMode === 'custom' ? 'custom' : 'category';
  const endpointCategory: ProjectModelEndpointCategory =
    record.endpointCategory === 'chat' ||
    record.endpointCategory === 'image' ||
    record.endpointCategory === 'image-edit' ||
    record.endpointCategory === 'video'
      ? record.endpointCategory
      : inferEndpointCategory(type);
  const customEndpoint = cleanText(record.customEndpoint);
  const enabled = record.enabled !== false;
  const configured = Boolean(
    enabled &&
    type &&
    ((endpointMode === 'category' && endpointCategory) || (endpointMode === 'custom' && customEndpoint))
  );

  return {
    id,
    modelId,
    enabled,
    type,
    endpointMode,
    endpointCategory: endpointMode === 'category' ? endpointCategory : '',
    customEndpoint: endpointMode === 'custom' ? customEndpoint : '',
    source: record.source === 'manual' ? 'manual' : 'imported',
    configured,
    createdAt: cleanTimestamp(record.createdAt),
    updatedAt: cleanTimestamp(record.updatedAt),
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

export function groupConfiguredProjectModels(projectModels: ProjectModel[]): CategorizedModels {
  const groups: CategorizedModels = { all: [], chat: [], image: [], video: [] };
  for (const model of projectModels) {
    if (!model.configured) continue;
    groups.all.push(model.modelId);
    if (model.type === 'chat') groups.chat.push(model.modelId);
    if (model.type === 'image') groups.image.push(model.modelId);
    if (model.type === 'video') groups.video.push(model.modelId);
  }
  return groups;
}

export function createImportedProjectModels(modelIds: string[], existing: ProjectModel[]) {
  const now = Date.now();
  const byId = new Map(existing.map((model) => [model.modelId, model]));

  for (const rawModelId of modelIds) {
    const modelId = cleanText(rawModelId);
    if (!modelId || byId.has(modelId)) continue;
    byId.set(modelId, {
      id: modelId,
      modelId,
      enabled: true,
      type: '',
      endpointMode: 'category',
      endpointCategory: '',
      customEndpoint: '',
      source: 'imported',
      configured: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return Array.from(byId.values()).sort((left, right) => left.modelId.localeCompare(right.modelId));
}
