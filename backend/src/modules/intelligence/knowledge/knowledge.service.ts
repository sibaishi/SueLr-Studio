import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ValidationError } from '../../../app/errors/index.ts';
import {
  ensureDir,
  ensureJsonFile,
  getScopedStoragePaths,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../../platform/storage/index.ts';
import { agentMemoryService } from '../../agent/agent-memory.service.ts';
import { executionService } from '../../execution/execution.service.ts';
import { settingsService } from '../../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import { workflowsService } from '../../workflows/workflows.service.ts';
import { WORKFLOW_NODE_CAPABILITY_SEEDS } from '../workflow-builder/node-capabilities.ts';

export const KNOWLEDGE_CATEGORIES = [
  'user-memory',
  'project-knowledge',
  'brand-knowledge',
  'workflow-knowledge',
  'asset-knowledge',
  'run-knowledge',
  'prompt-library',
  'model-knowledge',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

const CATEGORY_FILE_MAP: Record<KnowledgeCategory, string> = {
  'user-memory': 'user-memory.json',
  'project-knowledge': 'project-knowledge.json',
  'brand-knowledge': 'brand-knowledge.json',
  'workflow-knowledge': 'workflow-knowledge.json',
  'asset-knowledge': 'asset-knowledge.json',
  'run-knowledge': 'run-knowledge.json',
  'prompt-library': 'prompt-library.json',
  'model-knowledge': 'model-knowledge.json',
};

const CATEGORY_TYPE_MAP: Record<KnowledgeCategory, string> = {
  'user-memory': 'user_memory',
  'project-knowledge': 'project_knowledge',
  'brand-knowledge': 'brand_knowledge',
  'workflow-knowledge': 'workflow_knowledge',
  'asset-knowledge': 'asset_knowledge',
  'run-knowledge': 'run_knowledge',
  'prompt-library': 'prompt_library',
  'model-knowledge': 'model_knowledge',
};

const SENSITIVE_WRITE_CATEGORIES = new Set<KnowledgeCategory>(['brand-knowledge', 'project-knowledge']);
const SEED_SOURCE_KINDS = new Set(['system_seed', 'saved_workflow_index', 'runtime_model_index']);

const SYSTEM_WORKFLOW_NODE_SEEDS = WORKFLOW_NODE_CAPABILITY_SEEDS;

const knowledgeRecordSchema = z.object({
  id: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(120),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  scope: z.enum(['local-private', 'local-project']).default('local-private'),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(12000),
  structured: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  source: z.object({
    kind: z.string().trim().min(1).max(80),
    id: z.string().trim().max(240).optional(),
    label: z.string().trim().max(240).optional(),
  }),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(80),
        id: z.string().trim().max(240).optional(),
        url: z.string().trim().max(1000).optional(),
        summary: z.string().trim().max(1000).optional(),
      }),
    )
    .max(20)
    .default([]),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  sourceRuntime: z.literal('local').default('local'),
  version: z.number().int().positive().default(1),
  syncStatus: z.literal('localOnly').default('localOnly'),
  requiresConfirmation: z.boolean().default(false),
  confirmedAt: z.number().int().positive().optional(),
});

const writeKnowledgeSchema = z.object({
  category: z.enum(KNOWLEDGE_CATEGORIES),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(12000),
  structured: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  scope: z.enum(['local-private', 'local-project']).optional(),
  source: z
    .object({
      kind: z.string().trim().min(1).max(80),
      id: z.string().trim().max(240).optional(),
      label: z.string().trim().max(240).optional(),
    })
    .optional(),
  evidence: knowledgeRecordSchema.shape.evidence.optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmed: z.boolean().optional(),
});

export type KnowledgeRecord = z.infer<typeof knowledgeRecordSchema>;
export type WriteKnowledgeInput = z.infer<typeof writeKnowledgeSchema>;

function createKnowledgeId(category: KnowledgeCategory) {
  return `kn_${category.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanString(value: DynamicValue, maxLength = 12000) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function normalizeTags(value: DynamicValue): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => cleanString(item, 80))
        .filter(Boolean)
        .slice(0, 40),
    ),
  );
}

function tokenize(value: DynamicValue): string[] {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 2);
}

function buildLocalMetadata() {
  return {
    sourceRuntime: 'local' as const,
    syncStatus: 'localOnly' as const,
  };
}

function getCategoryFile(category: KnowledgeCategory, scope?: DynamicValue) {
  const baseDir = getScopedStoragePaths(scope).intelligenceKnowledgeDir;
  const filePath = safeResolveWithin(baseDir, CATEGORY_FILE_MAP[category]);
  if (!filePath) throw new ValidationError('KNOWLEDGE_CATEGORY_INVALID', '知识分类路径非法');
  return filePath;
}

function extractCharacterBigrams(text: string): string[] {
  const chars = cleanString(text, 200)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  if (chars.length < 2) return [];
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    bigrams.push(chars.slice(index, index + 2));
  }
  return bigrams;
}

function scoreRecord(record: KnowledgeRecord, query: string) {
  const terms = tokenize(query);
  const haystack = [
    record.title,
    record.content,
    record.tags.join(' '),
    record.type,
    record.source.kind,
    record.source.label,
    ...(record.structured?.nodeType ? [String(record.structured.nodeType)] : []),
    ...(Array.isArray(record.structured?.useWhen) ? (record.structured.useWhen as string[]) : []),
    ...(Array.isArray(record.structured?.avoidWhen) ? (record.structured.avoidWhen as string[]) : []),
  ]
    .join(' ')
    .toLowerCase();
  if (!query) return record.confidence + Math.max(0, 1 - (Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24 * 30));

  const loweredQuery = query.toLowerCase();
  const phrase = haystack.includes(loweredQuery) ? 4 : 0;
  const termScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  const characterOverlap =
    terms.length === 0
      ? cleanString(query, 200)
          .split('')
          .filter((char) => haystack.includes(char.toLowerCase())).length / 6
      : 0;

  const queryBigrams = extractCharacterBigrams(query);
  const haystackBigrams = new Set(extractCharacterBigrams(haystack));
  const bigramOverlap =
    queryBigrams.length > 0
      ? queryBigrams.filter((bigram) => haystackBigrams.has(bigram)).length / queryBigrams.length
      : 0;

  const tagSynonymScore = [
    ['分镜图', '分镜', 'storyboard'],
    ['故事板', '分镜', 'storyboard'],
    ['图片', 'image', '照片', '图'],
    ['文本', 'text', '字符串', 'string', '文案'],
    ['视频', 'video'],
    ['音频', 'audio'],
    ['合并', 'merge', '汇总', '收集'],
    ['拆分', 'split', '拆分', '分割', '分成'],
    ['逐项', 'iterate', '分批', '逐个'],
    ['批量', 'iterate', '分批', '逐项'],
    ['对话', 'chat', 'aiChat', '问答', '聊天'],
    ['保存', 'save', '落盘', '存档'],
  ];
  const synonymScore = tagSynonymScore.reduce((score, group) => {
    if (group.some((keyword) => loweredQuery.includes(keyword)) && group.some((keyword) => haystack.includes(keyword))) {
      return score + 2;
    }
    return score;
  }, 0);

  return phrase + termScore + Math.min(bigramOverlap * 2, 3) + Math.min(characterOverlap, 2) + synonymScore + record.confidence;
}

function normalizeRecord(
  input: DynamicValue,
  category: KnowledgeCategory,
  scope?: DynamicValue,
): KnowledgeRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const now = Date.now();
  const rawScope = input.scope === 'local-project' ? 'local-project' : 'local-private';
  const parsed = knowledgeRecordSchema.safeParse({
    id: cleanString(input.id, 160) || createKnowledgeId(category),
    type: cleanString(input.type, 120) || CATEGORY_TYPE_MAP[category],
    category,
    scope: rawScope,
    title: cleanString(input.title, 240) || cleanString(input.content, 80) || category,
    content: cleanString(input.content),
    structured:
      input.structured && typeof input.structured === 'object' && !Array.isArray(input.structured)
        ? input.structured
        : {},
    tags: normalizeTags(input.tags),
    source:
      input.source && typeof input.source === 'object' && !Array.isArray(input.source)
        ? input.source
        : { kind: 'manual' },
    confidence: Number.isFinite(input.confidence) ? Number(input.confidence) : 0.5,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    ...buildLocalMetadata(),
    version: Number(input.version) || 1,
    requiresConfirmation: input.requiresConfirmation === true,
    confirmedAt: Number(input.confirmedAt) || undefined,
  });
  return parsed.success ? parsed.data : null;
}

function toSearchResult(record: KnowledgeRecord, score: number) {
  return {
    id: record.id,
    type: record.type,
    category: record.category,
    scope: record.scope,
    title: record.title,
    content: record.content,
    structured: record.structured,
    tags: record.tags,
    source: record.source,
    confidence: record.confidence,
    evidence: record.evidence,
    updatedAt: record.updatedAt,
    relevance: Number(score.toFixed(3)),
    governance: {
      role: 'context_only',
      requiresVerification: record.requiresConfirmation || !record.confirmedAt,
      note: record.requiresConfirmation
        ? '这条知识影响生产行为，使用前需要确认。'
        : '本地知识只提供上下文建议，不能绕过用户确认。',
    },
  };
}

function nodeTypeCounts(workflow: PlainObject) {
  const counts: Record<string, number> = {};
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  for (const node of nodes) {
    const type = cleanString((node as PlainObject)?.type, 120);
    if (type) counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function summarizeWorkflowKnowledge(workflow: PlainObject) {
  const nodeCounts = nodeTypeCounts(workflow);
  const nodeTypes = Object.keys(nodeCounts);
  const content = [
    `已保存工作流：${cleanString(workflow.name, 200) || cleanString(workflow.id, 120)}`,
    workflow.description ? `描述：${cleanString(workflow.description, 1000)}` : '',
    `节点数：${Array.isArray(workflow.nodes) ? workflow.nodes.length : Number(workflow.nodeCount) || 0}`,
    nodeTypes.length > 0 ? `节点类型：${nodeTypes.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    content,
    nodeCounts,
    nodeTypes,
  };
}

function createSeedRecord(
  input: {
    id: string;
    category: KnowledgeCategory;
    title: string;
    content: string;
    structured?: PlainObject;
    tags?: string[];
    source: { kind: string; id?: string; label?: string };
    confidence?: number;
    evidence?: Array<{ kind: string; id?: string; url?: string; summary?: string }>;
    scope?: 'local-private' | 'local-project';
  },
  requestScope?: DynamicValue,
): KnowledgeRecord | null {
  const now = Date.now();
  return normalizeRecord(
    {
      id: input.id,
      type: CATEGORY_TYPE_MAP[input.category],
      category: input.category,
      scope: input.scope || 'local-private',
      title: input.title,
      content: input.content,
      structured: input.structured || {},
      tags: input.tags || [],
      source: input.source,
      confidence: input.confidence ?? 0.75,
      evidence: input.evidence || [{ kind: input.source.kind, id: input.source.id, summary: input.source.label }],
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
    },
    input.category,
    requestScope,
  );
}

export class KnowledgeService {
  ensureKnowledgeStorage(scope?: DynamicValue) {
    const storagePaths = getScopedStoragePaths(scope);
    ensureDir(storagePaths.intelligenceKnowledgeDir);
    for (const category of KNOWLEDGE_CATEGORIES) {
      ensureJsonFile(getCategoryFile(category, scope), []);
    }
    return storagePaths.intelligenceKnowledgeDir;
  }

  listKnowledgeSources(scope?: DynamicValue) {
    const directory = this.ensureKnowledgeStorage(scope);
    const files = KNOWLEDGE_CATEGORIES.map((category) => {
      const filePath = getCategoryFile(category, scope);
      const records = this.loadCategory(category, scope);
      return {
        category,
        fileName: path.basename(filePath),
        count: records.length,
      };
    });
    return {
      storage: 'local-json',
      scope: 'local',
      directory,
      categories: [...KNOWLEDGE_CATEGORIES],
      files,
      items: files,
      schema: {
        required: ['id', 'type', 'category', 'scope', 'title', 'content', 'source', 'confidence', 'evidence'],
        reserved: ['sourceRuntime', 'version', 'syncStatus'],
      },
      governance: {
        defaultScope: 'local-private',
        projectScope: 'local-project',
        sensitiveWriteConfirmation: ['brand-knowledge', 'project-knowledge'],
        runKnowledgeRequiresTrace: true,
      },
    };
  }

  loadCategory(category: KnowledgeCategory, scope?: DynamicValue): KnowledgeRecord[] {
    this.ensureKnowledgeStorage(scope);
    const records = readJsonFile<DynamicValue[]>(getCategoryFile(category, scope), []);
    return records
      .map((record) => normalizeRecord(record, category, scope))
      .filter((record): record is KnowledgeRecord => Boolean(record));
  }

  saveCategory(category: KnowledgeCategory, records: KnowledgeRecord[], scope?: DynamicValue) {
    this.ensureKnowledgeStorage(scope);
    writeJsonFile(getCategoryFile(category, scope), records);
  }

  listAll(scope?: DynamicValue) {
    return KNOWLEDGE_CATEGORIES.flatMap((category) => this.loadCategory(category, scope));
  }

  rebuildSeedKnowledge(options: { scope?: DynamicValue } = {}) {
    const generated: Record<KnowledgeCategory, KnowledgeRecord[]> = {
      'user-memory': [],
      'project-knowledge': [],
      'brand-knowledge': [],
      'workflow-knowledge': [],
      'asset-knowledge': [],
      'run-knowledge': [],
      'prompt-library': [],
      'model-knowledge': [],
    };

    for (const seed of SYSTEM_WORKFLOW_NODE_SEEDS) {
      const record = createSeedRecord(
        {
          id: seed.id,
          category: 'workflow-knowledge',
          title: seed.title,
          content: seed.content,
          structured: seed.structured,
          tags: [...seed.tags],
          source: { kind: 'system_seed', id: seed.id, label: 'SueLr workflow node capability seed' },
          confidence: 0.9,
        },
        options.scope,
      );
      if (record) generated['workflow-knowledge'].push(record);
    }

    const workflows = workflowsService.list({ scope: options.scope });
    for (const workflow of workflows) {
      const summary = summarizeWorkflowKnowledge(workflow);
      const workflowId = cleanString(workflow.id, 160);
      const record = createSeedRecord(
        {
          id: `idx_workflow_${workflowId}`,
          category: 'workflow-knowledge',
          title: `已保存工作流 ${cleanString(workflow.name, 160) || workflowId}`,
          content: summary.content,
          structured: {
            workflowId,
            workflowName: workflow.name,
            nodeCount: workflow.nodeCount,
            nodeTypes: summary.nodeTypes,
            nodeCounts: summary.nodeCounts,
            updatedAt: workflow.updatedAt,
          },
          tags: ['saved-workflow', ...summary.nodeTypes],
          source: { kind: 'saved_workflow_index', id: workflowId, label: cleanString(workflow.name, 200) },
          evidence: [{ kind: 'workflow', id: workflowId, summary: cleanString(workflow.name, 200) }],
          confidence: 0.82,
          scope: 'local-project',
        },
        options.scope,
      );
      if (record) generated['workflow-knowledge'].push(record);
    }

    const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
    const configs = Array.isArray(settings?.configs) ? settings.configs : [];
    for (const config of configs) {
      const models = Array.isArray((config as PlainObject).models) ? (config as PlainObject).models : [];
      const configId = cleanString((config as PlainObject).id, 160);
      const configName = cleanString((config as PlainObject).name, 200) || configId || 'Provider';
      const record = createSeedRecord(
        {
          id: `idx_model_provider_${configId || configName.replace(/[^a-zA-Z0-9_-]+/g, '_')}`,
          category: 'model-knowledge',
          title: `本地模型配置 ${configName}`,
          content: [
            `Provider：${configName}`,
            `模型数量：${models.length}`,
            models.length > 0
              ? `模型：${models
                  .slice(0, 30)
                  .map((model: DynamicValue) => cleanString(model, 160))
                  .join(', ')}`
              : '',
            (config as PlainObject).id === settings?.activeConfigId ? '当前激活配置：是' : '',
          ]
            .filter(Boolean)
            .join('\n'),
          structured: {
            configId,
            name: configName,
            active: (config as PlainObject).id === settings?.activeConfigId,
            modelCount: models.length,
            models: models.slice(0, 100),
          },
          tags: ['runtime-model-index', 'provider', ...(models.length > 0 ? ['models-configured'] : ['models-empty'])],
          source: { kind: 'runtime_model_index', id: configId, label: configName },
          evidence: [{ kind: 'settings_runtime_config', id: configId, summary: configName }],
          confidence: 0.7,
        },
        options.scope,
      );
      if (record) generated['model-knowledge'].push(record);
    }

    const result: Record<string, { removed: number; added: number; total: number }> = {};
    for (const category of KNOWLEDGE_CATEGORIES) {
      const current = this.loadCategory(category, options.scope);
      const kept = current.filter((record) => !SEED_SOURCE_KINDS.has(record.source.kind));
      const next = [...kept, ...generated[category]];
      this.saveCategory(category, next, options.scope);
      result[category] = {
        removed: current.length - kept.length,
        added: generated[category].length,
        total: next.length,
      };
    }

    return {
      status: 'rebuilt',
      sourceKinds: Array.from(SEED_SOURCE_KINDS),
      categories: result,
      governance: '系统种子和索引只描述现有能力、已保存工作流和本地模型配置，不作为用户偏好或品牌规则。',
    };
  }

  search(input: DynamicValue = {}, options: { scope?: DynamicValue } = {}) {
    const query = cleanString(input?.query, 2000);
    const requestedCategories: KnowledgeCategory[] = Array.isArray(input?.categories)
      ? input.categories.filter((category: DynamicValue): category is KnowledgeCategory =>
          KNOWLEDGE_CATEGORIES.includes(category),
        )
      : [...KNOWLEDGE_CATEGORIES];
    const limit = Math.min(Math.max(Number(input?.limit) || 8, 1), 50);
    const matches = requestedCategories
      .flatMap((category: KnowledgeCategory) => this.loadCategory(category, options.scope))
      .map((record: KnowledgeRecord) => ({ record, score: scoreRecord(record, query) }))
      .filter((item: { record: KnowledgeRecord; score: number }) => !query || item.score > 0)
      .sort(
        (left: { record: KnowledgeRecord; score: number }, right: { record: KnowledgeRecord; score: number }) =>
          right.score - left.score || right.record.updatedAt - left.record.updatedAt,
      )
      .slice(0, limit)
      .map((item: { record: KnowledgeRecord; score: number }) => toSearchResult(item.record, item.score));
    return {
      items: matches,
      source: 'local-json',
      query,
      categories: requestedCategories,
      governance: '知识库结果只作为上下文建议；工作流选择、输入覆盖和执行仍需用户确认。',
    };
  }

  write(input: DynamicValue, options: { scope?: DynamicValue } = {}) {
    const parsed = writeKnowledgeSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('KNOWLEDGE_WRITE_INVALID', '知识写入参数无效', parsed.error.flatten());
    }
    const value = parsed.data;
    const requiresConfirmation = SENSITIVE_WRITE_CATEGORIES.has(value.category);
    if (requiresConfirmation && value.confirmed !== true) {
      return {
        status: 'approval_required',
        approvalCode: 'confirmKnowledgeWrite',
        category: value.category,
        message: '品牌规则和项目规则写入前需要用户确认。',
      };
    }
    if (value.category === 'run-knowledge') {
      const hasRunEvidence = (value.evidence || []).some((item) => item.kind === 'run_trace' && item.id);
      if (!hasRunEvidence) {
        throw new ValidationError('KNOWLEDGE_RUN_TRACE_REQUIRED', '运行知识必须关联真实 run trace');
      }
    }

    const now = Date.now();
    const record = normalizeRecord(
      {
        id: createKnowledgeId(value.category),
        type: CATEGORY_TYPE_MAP[value.category],
        category: value.category,
        scope: value.scope || (value.category === 'project-knowledge' ? 'local-project' : 'local-private'),
        title: value.title,
        content: value.content,
        structured: value.structured || {},
        tags: value.tags || [],
        source: value.source || { kind: 'manual' },
        confidence: value.confidence ?? (value.confirmed ? 0.8 : 0.55),
        evidence: value.evidence || [],
        createdAt: now,
        updatedAt: now,
        requiresConfirmation,
        confirmedAt: requiresConfirmation ? now : undefined,
      },
      value.category,
      options.scope,
    );
    if (!record) {
      throw new ValidationError('KNOWLEDGE_WRITE_INVALID', '知识记录无法规范化');
    }

    const current = this.loadCategory(value.category, options.scope);
    this.saveCategory(value.category, [...current.filter((item) => item.id !== record.id), record], options.scope);
    return {
      status: 'written',
      record,
    };
  }

  importLegacyMemory(options: { scope?: DynamicValue } = {}) {
    const memories = agentMemoryService.list({ scope: options.scope });
    let imported = 0;
    const current = this.loadCategory('user-memory', options.scope);
    const byId = new Map(current.map((record) => [record.id, record]));

    for (const memory of memories) {
      const record = normalizeRecord(
        {
          id: `legacy_${memory.id}`,
          type: 'user_memory',
          category: 'user-memory',
          scope: memory.workflowId ? 'local-project' : 'local-private',
          title: cleanString(memory.content, 80) || 'Legacy memory',
          content: memory.content,
          tags: ['legacy-memory', ...normalizeTags(memory.tags)],
          source: { kind: 'legacy_agent_memory', id: memory.id },
          confidence: Math.min(0.85, Math.max(0.35, Number(memory.importance) / 5 || 0.5)),
          evidence: [{ kind: 'legacy_agent_memory', id: memory.id }],
          createdAt: Number(memory.createdAt) || Date.now(),
          updatedAt: Number(memory.updatedAt) || Date.now(),
        },
        'user-memory',
        options.scope,
      );
      if (record && !byId.has(record.id)) {
        byId.set(record.id, record);
        imported += 1;
      }
    }

    this.saveCategory('user-memory', Array.from(byId.values()), options.scope);
    return {
      status: 'imported',
      imported,
      total: byId.size,
    };
  }

  summarizeRun(input: DynamicValue, options: { scope?: DynamicValue } = {}) {
    const runId = cleanString(input?.runId, 200);
    if (!runId) throw new ValidationError('KNOWLEDGE_RUN_ID_REQUIRED', 'runId 不能为空');
    const summary = executionService.getRecentRunSummary(runId, { scope: options.scope });
    if (!summary) {
      throw new ValidationError('KNOWLEDGE_RUN_TRACE_NOT_FOUND', '未找到可写入知识库的真实 run trace');
    }
    const content = [
      `运行 ${runId}`,
      summary.workflowName ? `工作流：${summary.workflowName}` : '',
      `状态：${summary.status}`,
      Number.isFinite(summary.successCount) ? `成功节点：${summary.successCount}` : '',
      Number.isFinite(summary.failCount) ? `失败节点：${summary.failCount}` : '',
      summary.summary ? `摘要：${summary.summary}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.write(
      {
        category: 'run-knowledge',
        title: `运行经验 ${runId}`,
        content,
        structured: summary,
        tags: ['run-trace', summary.status, summary.workflowId].filter(Boolean),
        source: { kind: 'run_trace', id: runId, label: summary.workflowName || summary.workflowId || runId },
        evidence: [{ kind: 'run_trace', id: runId, summary: summary.summary || '' }],
        confidence: summary.status === 'completed' ? 0.8 : 0.65,
      },
      options,
    );
  }

  extractPreference(input: DynamicValue, options: { scope?: DynamicValue } = {}) {
    const text = cleanString(input?.text || input?.content, 12000);
    if (!text) throw new ValidationError('KNOWLEDGE_PREFERENCE_TEXT_REQUIRED', '偏好文本不能为空');
    const preferenceSignals = ['我喜欢', '我不喜欢', '偏好', '不要', '常用', '希望', '默认'];
    const hasSignal = preferenceSignals.some((signal) => text.includes(signal));
    if (!hasSignal) {
      return {
        status: 'skipped',
        reason: 'no_clear_preference_signal',
      };
    }
    return this.write(
      {
        category: 'user-memory',
        title: cleanString(input?.title, 120) || '用户偏好',
        content: text,
        tags: ['preference'],
        source: { kind: 'user_input', label: 'explicit preference text' },
        confidence: 0.7,
      },
      options,
    );
  }

  linkAsset(input: DynamicValue, options: { scope?: DynamicValue } = {}) {
    const url = cleanString(input?.url, 1000);
    if (
      !url.startsWith('/api/outputs/') &&
      !url.startsWith('/api/files/') &&
      !url.startsWith('/api/assistant/files/')
    ) {
      throw new ValidationError('KNOWLEDGE_ASSET_URL_INVALID', '素材知识只能记录运行时相对 URL');
    }
    return this.write(
      {
        category: 'asset-knowledge',
        title: cleanString(input?.title, 160) || path.basename(url),
        content: cleanString(input?.description, 2000) || url,
        structured: { url, mimeType: cleanString(input?.mimeType, 120) },
        tags: ['asset', ...normalizeTags(input?.tags)],
        source: { kind: 'runtime_asset', id: url },
        evidence: [{ kind: 'asset_url', url }],
        confidence: 0.75,
      },
      options,
    );
  }

  promoteToTemplate(input: DynamicValue, options: { scope?: DynamicValue } = {}) {
    if (input?.confirmed !== true) {
      return {
        status: 'approval_required',
        approvalCode: 'confirmTemplatePromotion',
        message: '保存工作流模板前需要用户确认。',
      };
    }
    return this.write(
      {
        category: 'workflow-knowledge',
        title: cleanString(input?.title, 160) || '工作流模板',
        content: cleanString(input?.content, 12000) || '用户确认保存的工作流模板',
        structured: input?.workflow && typeof input.workflow === 'object' ? { workflow: input.workflow } : {},
        tags: ['template', ...normalizeTags(input?.tags)],
        source: { kind: 'user_confirmed_template', id: cleanString(input?.workflowId, 200) },
        evidence: cleanString(input?.workflowId, 200)
          ? [{ kind: 'workflow', id: cleanString(input.workflowId, 200) }]
          : [],
        confidence: 0.8,
      },
      options,
    );
  }

  clearAllForTests(scope?: DynamicValue) {
    const directory = this.ensureKnowledgeStorage(scope);
    if (!fs.existsSync(directory)) return;
    for (const category of KNOWLEDGE_CATEGORIES) {
      writeJsonFile(getCategoryFile(category, scope), []);
    }
  }
}

export const knowledgeService = new KnowledgeService();
