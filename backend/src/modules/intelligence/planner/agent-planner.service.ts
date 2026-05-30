import { ProviderError } from '../../../app/errors/index.ts';
import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import { createLogger } from '../../../platform/logging/logger.ts';
import { settingsService } from '../../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { AgentPlanRequest } from '../intelligence.schema.ts';
import { knowledgeService } from '../knowledge/knowledge.service.ts';
import { skillRegistry } from '../skills/skill-registry.ts';

const logger = createLogger({ module: 'agent-planner-service' });
type ChatCompletionRunner = typeof runChatCompletion;
type SkillRegistryLike = Pick<typeof skillRegistry, 'list'>;
type KnowledgeServiceLike = Pick<typeof knowledgeService, 'rebuildSeedKnowledge' | 'search'>;

export type AgentPlan = {
  id: string;
  source: 'llm' | 'local-fallback';
  plannerModel: {
    id: string;
    modelId: string;
    configId?: string;
    configName?: string;
    label?: string;
  };
  summary: string;
  toolName: 'workflow.createDraft';
  toolInput: {
    input: string;
    plannerNotes?: string;
  };
  reasoningSummary: string;
  warnings: string[];
  knowledgeContext: {
    source: string;
    items: Array<{
      id: string;
      title: string;
      category: string;
      sourceKind: string;
      nodeType?: string;
    }>;
  };
};

type AgentPlanKnowledgeContext = AgentPlan['knowledgeContext'];

function gid(prefix = 'plan') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value: DynamicValue, maxLength = 12000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function readJsonObject(text: string): PlainObject | null {
  const source = cleanText(text);
  if (!source) return null;
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || source;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeWarnings(value: DynamicValue) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, 240))
    .filter(Boolean)
    .slice(0, 8);
}

function getEmptyKnowledgeContext(): AgentPlanKnowledgeContext {
  return {
    source: 'local-json',
    items: [],
  };
}

function fallbackPlan(input: AgentPlanRequest, reason = '', knowledgeContext = getEmptyKnowledgeContext()): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已按当前可用工具生成工作流草案计划。',
    toolName: 'workflow.createDraft',
    toolInput: { input: input.input },
    reasoningSummary: reason || 'Planner 未返回可用结构化计划，已回退到本地工作流草案工具。',
    warnings: reason ? [reason] : [],
    knowledgeContext,
  };
}

function looksLikePromptInstruction(text: string, original: string) {
  if (!text || text === original) return false;
  const promptSignals = [
    '你是',
    '请生成',
    '生成提示词',
    '提示词',
    'system prompt',
    'prompt engineering',
    '请根据以下',
    '输出格式',
    '不要输出',
    '必须输出',
  ];
  const signalCount = promptSignals.reduce((count, signal) => count + (text.includes(signal) ? 1 : 0), 0);
  return signalCount >= 2 || text.length > original.length * 2.5;
}

function normalizePlan(raw: PlainObject | null, input: AgentPlanRequest, knowledgeContext = getEmptyKnowledgeContext()): AgentPlan | null {
  if (!raw) return null;
  const toolName = cleanText(raw.toolName || raw.tool, 120);
  if (toolName !== 'workflow.createDraft') return null;
  const toolInput = raw.toolInput && typeof raw.toolInput === 'object' && !Array.isArray(raw.toolInput)
    ? (raw.toolInput as PlainObject)
    : {};
  const rawPlannedInput = cleanText(toolInput.input || input.input);
  const originalInput = cleanText(input.input);
  const plannedInput = looksLikePromptInstruction(rawPlannedInput, originalInput) ? originalInput : rawPlannedInput;
  if (!plannedInput) return null;
  const plannerNotes = cleanText(toolInput.plannerNotes || raw.plannerNotes, 1000);
  const warnings = normalizeWarnings(raw.warnings);
  if (rawPlannedInput !== plannedInput) {
    warnings.push('Planner 返回内容疑似提示词模板，已保留用户原始需求作为工作流草案输入。');
  }

  return {
    id: gid(),
    source: 'llm',
    plannerModel: input.plannerModel,
    summary: cleanText(raw.summary, 500) || '已生成工作流草案计划。',
    toolName: 'workflow.createDraft',
    toolInput: { input: plannedInput, ...(plannerNotes ? { plannerNotes } : {}) },
    reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断当前任务应交给工作流草案工具处理。',
    warnings,
    knowledgeContext,
  };
}

function summarizeToolSchema(schema: DynamicValue) {
  if (!schema || typeof schema !== 'object') return {};
  const properties = schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties).slice(0, 12) : [];
  return {
    required: Array.isArray(schema.required) ? schema.required.slice(0, 12) : [],
    properties,
  };
}

function buildToolContext(skills: SkillRegistryLike) {
  return skills
    .list()
    .filter((skill) => ['workflow.createDraft'].includes(skill.id))
    .map((skill) => ({
      id: skill.id,
      title: skill.title,
      description: skill.description,
      sideEffect: skill.sideEffect,
      requiresApproval: skill.requiresApproval,
      inputSchema: summarizeToolSchema(skill.inputSchema),
    }));
}

function buildKnowledgeContext(input: AgentPlanRequest, knowledge: KnowledgeServiceLike, options: { scope?: DynamicValue }) {
  knowledge.rebuildSeedKnowledge({ scope: options.scope });
  const result = knowledge.search(
    {
      query: input.input,
      categories: ['workflow-knowledge', 'model-knowledge', 'user-memory', 'project-knowledge', 'brand-knowledge'],
      limit: 10,
    },
    { scope: options.scope },
  );
  return {
    source: result.source,
    items: result.items.map((item: DynamicValue) => ({
      id: cleanText(item.id, 160),
      title: cleanText(item.title, 240),
      category: cleanText(item.category, 80),
      sourceKind: cleanText(item.source?.kind, 80),
      nodeType: cleanText(item.structured?.nodeType, 120) || undefined,
      content: cleanText(item.content, 900),
      structured: item.structured && typeof item.structured === 'object' ? item.structured : {},
    })),
  };
}

function compactKnowledgeContext(context: ReturnType<typeof buildKnowledgeContext>) {
  return {
    source: context.source,
    items: context.items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      sourceKind: item.sourceKind,
      nodeType: item.nodeType,
    })),
  };
}

function buildPlannerMessages(input: AgentPlanRequest, tools: DynamicValue[], knowledgeContext: ReturnType<typeof buildKnowledgeContext>) {
  return [
    {
      role: 'system',
      content:
        [
          '你是 SueLr-Studio 的 Agent Planner。',
          '你只负责把用户需求转成受控工具计划，不直接执行工具，不修改画布。',
          '你必须基于“可用工具”和“本地知识库上下文”判断工具调用。',
          '当前第一批可执行工具只有 workflow.createDraft，用于生成可编辑工作流草案。',
          'workflow.createDraft.toolInput.input 必须保持用户原始任务语义，不能改写成给另一个模型看的提示词模板。',
          '可以把额外判断写入 toolInput.plannerNotes，但不要覆盖用户需求。',
          '如果用户说分镜图、故事板图片、storyboard sheet，这是图片序列/图片生成任务，不是视频生成任务。',
          '如果用户说分镜脚本、镜头脚本、旁白脚本，这是文本/对话任务，不是视频生成任务。',
          'promptHelper 不是通用提示词优化器；只有明确需要分镜图版式、三视图、视角或光照控制时才建议使用。',
          '必须只输出 JSON，不要输出 Markdown。',
          'JSON 结构：{"summary":"一句给用户看的计划总结","toolName":"workflow.createDraft","toolInput":{"input":"用户原始任务或等价短句","plannerNotes":"可选，简短说明领域、节点选择约束"},"reasoningSummary":"简短说明为什么调用该工具以及参考了哪些知识","warnings":[]}',
        ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户原始需求：${input.input}`,
        '',
        `可用工具：${JSON.stringify(tools)}`,
        '',
        `本地知识库上下文：${JSON.stringify(knowledgeContext.items)}`,
      ].join('\n'),
    },
  ];
}

export class AgentPlannerService {
  settings;
  chatCompletion: ChatCompletionRunner;
  skills: SkillRegistryLike;
  knowledge: KnowledgeServiceLike;

  constructor(
    deps: {
      settings?: DynamicValue;
      chatCompletion?: ChatCompletionRunner;
      skills?: SkillRegistryLike;
      knowledge?: KnowledgeServiceLike;
    } = {},
  ) {
    this.settings = deps.settings || settingsService;
    this.chatCompletion = deps.chatCompletion || runChatCompletion;
    this.skills = deps.skills || skillRegistry;
    this.knowledge = deps.knowledge || knowledgeService;
  }

  async createPlan(input: AgentPlanRequest, options: { scope?: DynamicValue } = {}): Promise<AgentPlan> {
    const runtimeConfig = this.settings.buildRuntimeConfig({ configId: input.plannerModel.configId }, options.scope);
    const tools = buildToolContext(this.skills);
    const fullKnowledgeContext = buildKnowledgeContext(input, this.knowledge, options);
    const knowledgeContext = compactKnowledgeContext(fullKnowledgeContext);
    try {
      const response = await this.chatCompletion({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: input.plannerModel.modelId,
        messages: buildPlannerMessages(input, tools, fullKnowledgeContext),
        temperature: 0.2,
        maxTokens: 1200,
        stream: false,
        scope: options.scope,
      });
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const normalized = normalizePlan(readJsonObject(content), input, knowledgeContext);
      if (normalized) return normalized;
      logger.warn('planner returned unusable plan', { model: input.plannerModel.modelId });
      return fallbackPlan(input, 'Planner 返回内容不是可执行的结构化计划。', knowledgeContext);
    } catch (error) {
      const normalizedError = error as DynamicValue;
      logger.warn('planner request failed, using fallback plan', {
        code: normalizedError?.code,
        message: normalizedError?.message,
      });
      if (!runtimeConfig.apiKey) {
        throw new ProviderError('AGENT_PLANNER_MODEL_UNAVAILABLE', 'Planner 模型缺少可用 API Key');
      }
      return fallbackPlan(input, normalizedError?.message || 'Planner 调用失败，已回退到本地计划。', knowledgeContext);
    }
  }
}

export const agentPlannerService = new AgentPlannerService();
