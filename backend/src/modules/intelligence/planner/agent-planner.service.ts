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
  source: 'llm' | 'local-fallback' | 'user-approved';
  plannerModel: {
    id: string;
    modelId: string;
    configId?: string;
    configName?: string;
    label?: string;
  };
  summary: string;
  toolName:
    | 'chat.respond'
    | 'workflow.inspect'
    | 'workflow.edit'
    | 'workflow.applyDraft'
    | 'workflow.createDraft'
    | 'workflow.execute'
    | 'workflow.diagnose'
    | 'workflow.summarizeRun';
  toolInput: PlainObject & {
    input?: string;
    plannerNotes?: string;
    response?: string;
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
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function hasWorkflowContext(context: PlainObject) {
  return (
    cleanText(context.workflowId, 120).length > 0 ||
    cleanText(context.workflowName, 200).length > 0 ||
    isPlainObject(context.workflowSnapshot)
  );
}

function hasWorkflowEditPatch(context: PlainObject) {
  return isPlainObject(context.workflowEditPatch);
}

function shouldUseWorkflowFallback(input: string) {
  return includesAny(input, [
    '工作流',
    '画布',
    '节点',
    '搭建',
    '创建',
    '生成',
    '执行',
    '运行',
    '批量',
    '分镜图',
    '主图',
    '详情页',
    'workflow',
    'canvas',
    'node',
    'run',
    'execute',
  ]);
}

function fallbackChatPlan(
  input: AgentPlanRequest,
  reason = '',
  knowledgeContext = getEmptyKnowledgeContext(),
): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已按普通对话回复。',
    toolName: 'chat.respond',
    toolInput: {
      input: input.input,
      response:
        reason || '我理解你的问题。当前没有调用工作流工具；你可以继续补充需求，我会根据需要再决定是否生成工作流草案。',
    },
    reasoningSummary: reason || 'Planner 未选择工具，按普通对话处理。',
    warnings: [],
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

function buildInspectFallbackPlan(
  input: AgentPlanRequest,
  knowledgeContext = getEmptyKnowledgeContext(),
  reason = '已按当前画布上下文生成工作流摘要。',
): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已准备读取当前工作流画布摘要。',
    toolName: 'workflow.inspect',
    toolInput: {
      ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
      ...(cleanText(input.context.workflowName, 200)
        ? { workflowName: cleanText(input.context.workflowName, 200) }
        : {}),
      ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
    },
    reasoningSummary: reason,
    warnings: [],
    knowledgeContext,
  };
}

function buildEditFallbackPlan(
  input: AgentPlanRequest,
  knowledgeContext = getEmptyKnowledgeContext(),
  reason = '已按当前画布上下文生成工作流修改草案。',
): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已准备为当前工作流生成可预览的修改草案。',
    toolName: 'workflow.edit',
    toolInput: {
      input: input.input,
      ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
      ...(cleanText(input.context.workflowName, 200)
        ? { workflowName: cleanText(input.context.workflowName, 200) }
        : {}),
      ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
    },
    reasoningSummary: reason,
    warnings: [],
    knowledgeContext,
  };
}

function buildApplyDraftFallbackPlan(
  input: AgentPlanRequest,
  knowledgeContext = getEmptyKnowledgeContext(),
  reason = '已准备应用当前工作流修改草案，仍需用户确认。',
): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已准备应用当前工作流修改草案。',
    toolName: 'workflow.applyDraft',
    toolInput: {
      ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
      ...(cleanText(input.context.workflowName, 200)
        ? { workflowName: cleanText(input.context.workflowName, 200) }
        : {}),
      ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
      ...(isPlainObject(input.context.workflowEditPatch) ? { patch: input.context.workflowEditPatch } : {}),
    },
    reasoningSummary: reason,
    warnings: [],
    knowledgeContext,
  };
}

function normalizePlan(
  raw: PlainObject | null,
  input: AgentPlanRequest,
  knowledgeContext = getEmptyKnowledgeContext(),
): AgentPlan | null {
  if (!raw) return null;
  const toolName = cleanText(raw.toolName || raw.tool, 120);
  if (
    ![
      'chat.respond',
      'workflow.inspect',
      'workflow.edit',
      'workflow.applyDraft',
      'workflow.createDraft',
      'workflow.execute',
      'workflow.diagnose',
      'workflow.summarizeRun',
    ].includes(toolName)
  ) {
    return null;
  }
  if (toolName === 'chat.respond') {
    const response = cleanText(raw.response || raw.toolInput?.response || raw.message || raw.content, 4000);
    if (!response) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary: cleanText(raw.summary, 500) || '已按普通对话回复。',
      toolName: 'chat.respond',
      toolInput: { input: input.input, response },
      reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断当前输入不需要调用工具。',
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
  const toolInput =
    raw.toolInput && typeof raw.toolInput === 'object' && !Array.isArray(raw.toolInput)
      ? (raw.toolInput as PlainObject)
      : {};
  if (toolName === 'workflow.execute') {
    const workflowId = cleanText(input.context.workflowId, 120);
    const workflowName = cleanText(input.context.workflowName, 200);
    if (!workflowId && !workflowName) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary: cleanText(raw.summary, 500) || '准备执行当前工作流。',
      toolName,
      toolInput: {
        ...(workflowId ? { workflowId } : {}),
        ...(workflowName ? { workflowName } : {}),
        ...(toolInput.inputs && typeof toolInput.inputs === 'object' && !Array.isArray(toolInput.inputs)
          ? { inputs: toolInput.inputs }
          : {}),
      },
      reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断用户希望执行当前工作流。',
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
  if (toolName === 'workflow.inspect') {
    if (!hasWorkflowContext(input.context)) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary: cleanText(raw.summary, 500) || '准备读取当前工作流画布摘要。',
      toolName,
      toolInput: {
        ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
        ...(cleanText(input.context.workflowName, 200)
          ? { workflowName: cleanText(input.context.workflowName, 200) }
          : {}),
        ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
      },
      reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断用户希望查看当前工作流画布摘要。',
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
  if (toolName === 'workflow.applyDraft') {
    if (!hasWorkflowEditPatch(input.context)) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary: cleanText(raw.summary, 500) || '准备应用当前工作流修改草案。',
      toolName,
      toolInput: {
        ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
        ...(cleanText(input.context.workflowName, 200)
          ? { workflowName: cleanText(input.context.workflowName, 200) }
          : {}),
        ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
        patch: input.context.workflowEditPatch,
      },
      reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断用户希望应用当前修改草案。',
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
  if (toolName === 'workflow.edit') {
    if (!hasWorkflowContext(input.context)) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary: cleanText(raw.summary, 500) || '准备为当前工作流生成修改草案。',
      toolName,
      toolInput: {
        input: input.input,
        ...(cleanText(input.context.workflowId, 120) ? { workflowId: cleanText(input.context.workflowId, 120) } : {}),
        ...(cleanText(input.context.workflowName, 200)
          ? { workflowName: cleanText(input.context.workflowName, 200) }
          : {}),
        ...(isPlainObject(input.context.workflowSnapshot) ? { workflowSnapshot: input.context.workflowSnapshot } : {}),
      },
      reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断用户希望修改当前工作流。',
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
  if (toolName === 'workflow.diagnose' || toolName === 'workflow.summarizeRun') {
    const runId = cleanText(input.context.runId, 200);
    if (!runId) return null;
    return {
      id: gid(),
      source: 'llm',
      plannerModel: input.plannerModel,
      summary:
        cleanText(raw.summary, 500) ||
        (toolName === 'workflow.diagnose' ? '准备诊断最近一次运行。' : '准备汇总最近一次运行。'),
      toolName,
      toolInput: { runId },
      reasoningSummary:
        cleanText(raw.reasoningSummary, 1000) ||
        (toolName === 'workflow.diagnose'
          ? 'Planner 判断用户希望诊断最近一次运行。'
          : 'Planner 判断用户希望查看最近一次运行汇总。'),
      warnings: normalizeWarnings(raw.warnings),
      knowledgeContext,
    };
  }
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
  const properties =
    schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties).slice(0, 12) : [];
  return {
    required: Array.isArray(schema.required) ? schema.required.slice(0, 12) : [],
    properties,
  };
}

function buildToolContext(skills: SkillRegistryLike) {
  return skills
    .list()
    .filter((skill) =>
      [
        'workflow.inspect',
        'workflow.edit',
        'workflow.applyDraft',
        'workflow.createDraft',
        'workflow.execute',
        'workflow.diagnose',
        'workflow.summarizeRun',
      ].includes(skill.id),
    )
    .map((skill) => ({
      id: skill.id,
      title: skill.title,
      description: skill.description,
      sideEffect: skill.sideEffect,
      requiresApproval: skill.requiresApproval,
      inputSchema: summarizeToolSchema(skill.inputSchema),
    }));
}

function includesAny(text: string, needles: string[]) {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function shouldInspectWorkflow(input: AgentPlanRequest) {
  return (
    hasWorkflowContext(input.context) &&
    includesAny(input.input, ['查看当前工作流', '查看当前画布', '检查当前工作流', 'inspect', 'summary', '总结这个工作流', '看看画布'])
  );
}

function shouldApplyWorkflowEdit(input: AgentPlanRequest) {
  return hasWorkflowEditPatch(input.context) && includesAny(input.input, ['应用', '确认应用', '套用', 'apply', '确认修改']);
}

function shouldEditWorkflow(input: AgentPlanRequest) {
  return (
    hasWorkflowContext(input.context) &&
    includesAny(input.input, ['修改', '改成', '调整', '编辑', '优化这个工作流', '把这个工作流', 'edit this workflow'])
  );
}

function buildKnowledgeContext(
  input: AgentPlanRequest,
  knowledge: KnowledgeServiceLike,
  options: { scope?: DynamicValue },
) {
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

function buildPlannerMessages(
  input: AgentPlanRequest,
  tools: DynamicValue[],
  knowledgeContext: ReturnType<typeof buildKnowledgeContext>,
) {
  return [
    {
      role: 'system',
      content: [
        '你是 SueLr-Studio 的 Agent Planner。',
        '你负责判断用户输入应当普通对话回复，还是转成受控工具计划；不要直接修改画布。',
        '你必须基于“可用工具”和“本地知识库上下文”判断工具调用。',
        '当前可执行工具包括 workflow.inspect、workflow.edit、workflow.applyDraft、workflow.createDraft、workflow.execute、workflow.diagnose 和 workflow.summarizeRun。',
        '历史文档中的 workflow.build 和 workflow.run 分别对应 workflow.createDraft 和 workflow.execute；不要输出旧名称。',
        '如果用户是在问概念、问原因、讨论方案、确认下一步、闲聊或要求解释，请使用 chat.respond，直接给出简洁自然语言回答，不要调用工作流工具。',
        '用户明确要求查看当前画布、当前工作流结构、节点摘要时，使用 workflow.inspect。',
        '用户明确要求修改当前工作流时，使用 workflow.edit。这个工具只生成 patch 预览，不直接改动画布。',
        '用户明确要求应用刚才生成的工作流修改草案时，使用 workflow.applyDraft。这个工具需要用户确认。',
        '用户明确要求创建、搭建或生成工作流时，使用 workflow.createDraft。',
        '用户明确要求运行当前工作流时，使用 workflow.execute。这个工具需要用户确认。',
        '用户明确要求分析最近一次运行失败原因时，使用 workflow.diagnose。',
        '用户明确要求查看最近一次运行结果或汇总时，使用 workflow.summarizeRun。',
        'workflow.inspect、workflow.edit、workflow.applyDraft、workflow.execute 的目标工作流都必须来自当前页面上下文，不要猜测 id。',
        'workflow.createDraft.toolInput.input 必须保持用户原始任务语义，不能改写成给另一个模型看的提示词模板。',
        'workflow.edit.toolInput.input 必须保持用户原始修改意图，不要把需求改写成提示词模板。',
        '可以把额外判断写入 toolInput.plannerNotes，但不要覆盖用户需求。',
        '如果用户说分镜图、故事板图片、storyboard sheet，这是图片序列/图片生成任务，不是视频生成任务。',
        '如果用户说分镜脚本、镜头脚本、旁白脚本，这是文本/对话任务，不是视频生成任务。',
        'promptHelper 不是通用提示词优化器；只有明确需要分镜图版式、三视图、视角或光照控制时才建议使用。',
        '必须只输出 JSON，不要输出 Markdown。',
        '普通对话 JSON：{"summary":"一句总结","toolName":"chat.respond","toolInput":{"response":"直接给用户看的回复"},"reasoningSummary":"为什么不调用工具","warnings":[]}',
        '检查工具 JSON：{"summary":"一句给用户看的检查说明","toolName":"workflow.inspect","toolInput":{},"reasoningSummary":"为什么查看当前工作流","warnings":[]}',
        '编辑工具 JSON：{"summary":"一句给用户看的修改说明","toolName":"workflow.edit","toolInput":{"input":"用户原始修改要求"},"reasoningSummary":"为什么生成修改草案","warnings":[]}',
        '应用工具 JSON：{"summary":"一句给用户看的应用说明","toolName":"workflow.applyDraft","toolInput":{},"reasoningSummary":"为什么应用当前修改草案","warnings":[]}',
        '工作流工具 JSON：{"summary":"一句给用户看的计划总结","toolName":"workflow.createDraft","toolInput":{"input":"用户原始任务或等价短句","plannerNotes":"可选，简短说明领域、节点选择约束"},"reasoningSummary":"简短说明为什么调用该工具以及参考了哪些知识","warnings":[]}',
        '执行工具 JSON：{"summary":"一句给用户看的执行说明","toolName":"workflow.execute","toolInput":{},"reasoningSummary":"为什么执行当前工作流","warnings":[]}',
        '诊断工具 JSON：{"summary":"一句给用户看的诊断说明","toolName":"workflow.diagnose","toolInput":{},"reasoningSummary":"为什么诊断最近一次运行","warnings":[]}',
        '汇总工具 JSON：{"summary":"一句给用户看的汇总说明","toolName":"workflow.summarizeRun","toolInput":{},"reasoningSummary":"为什么汇总最近一次运行","warnings":[]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户原始需求：${input.input}`,
        '',
        `当前页面上下文：${JSON.stringify(input.context)}`,
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
      if (shouldApplyWorkflowEdit(input)) {
        return buildApplyDraftFallbackPlan(input, knowledgeContext, 'Planner 返回内容不可用，已按当前修改草案走应用确认流程。');
      }
      if (shouldEditWorkflow(input)) {
        return buildEditFallbackPlan(input, knowledgeContext, 'Planner 返回内容不可用，已按当前工作流修改需求生成 patch 草案。');
      }
      if (shouldInspectWorkflow(input)) {
        return buildInspectFallbackPlan(input, knowledgeContext, 'Planner 返回内容不可用，已回退到当前工作流检查工具。');
      }
      if (!shouldUseWorkflowFallback(input.input)) {
        return fallbackChatPlan(input, 'Planner 返回内容不是可执行的结构化计划，已按普通对话处理。', knowledgeContext);
      }
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
      if (shouldApplyWorkflowEdit(input)) {
        return buildApplyDraftFallbackPlan(input, knowledgeContext, normalizedError?.message || 'Planner 调用失败，已回退到工作流修改应用流程。');
      }
      if (shouldEditWorkflow(input)) {
        return buildEditFallbackPlan(input, knowledgeContext, normalizedError?.message || 'Planner 调用失败，已回退到工作流修改草案工具。');
      }
      if (shouldInspectWorkflow(input)) {
        return buildInspectFallbackPlan(input, knowledgeContext, normalizedError?.message || 'Planner 调用失败，已回退到工作流检查工具。');
      }
      return fallbackPlan(input, normalizedError?.message || 'Planner 调用失败，已回退到本地计划。', knowledgeContext);
    }
  }
}

export const agentPlannerService = new AgentPlannerService();
