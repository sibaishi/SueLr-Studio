import { ProviderError } from '../../../app/errors/index.ts';
import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import { createLogger } from '../../../platform/logging/logger.ts';
import { settingsService } from '../../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { AgentPlanRequest } from '../intelligence.schema.ts';

const logger = createLogger({ module: 'agent-planner-service' });
type ChatCompletionRunner = typeof runChatCompletion;

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
  };
  reasoningSummary: string;
  warnings: string[];
};

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

function fallbackPlan(input: AgentPlanRequest, reason = ''): AgentPlan {
  return {
    id: gid(),
    source: 'local-fallback',
    plannerModel: input.plannerModel,
    summary: '已按当前可用工具生成工作流草案计划。',
    toolName: 'workflow.createDraft',
    toolInput: { input: input.input },
    reasoningSummary: reason || 'Planner 未返回可用结构化计划，已回退到本地工作流草案工具。',
    warnings: reason ? [reason] : [],
  };
}

function normalizePlan(raw: PlainObject | null, input: AgentPlanRequest): AgentPlan | null {
  if (!raw) return null;
  const toolName = cleanText(raw.toolName || raw.tool, 120);
  if (toolName !== 'workflow.createDraft') return null;
  const toolInput = raw.toolInput && typeof raw.toolInput === 'object' && !Array.isArray(raw.toolInput)
    ? (raw.toolInput as PlainObject)
    : {};
  const plannedInput = cleanText(toolInput.input || input.input);
  if (!plannedInput) return null;

  return {
    id: gid(),
    source: 'llm',
    plannerModel: input.plannerModel,
    summary: cleanText(raw.summary, 500) || '已生成工作流草案计划。',
    toolName: 'workflow.createDraft',
    toolInput: { input: plannedInput },
    reasoningSummary: cleanText(raw.reasoningSummary, 1000) || 'Planner 判断当前任务应交给工作流草案工具处理。',
    warnings: normalizeWarnings(raw.warnings),
  };
}

function buildPlannerMessages(input: AgentPlanRequest) {
  return [
    {
      role: 'system',
      content:
        [
          '你是 SueLr-Studio 的 Agent Planner。',
          '你只负责把用户需求转成受控工具计划，不直接执行工具，不修改画布。',
          '当前可用工具只有 workflow.createDraft，用于生成可编辑工作流草案。',
          '如果用户需求涉及搭建、编辑、生成、规划工作流，选择 workflow.createDraft。',
          '必须只输出 JSON，不要输出 Markdown。',
          'JSON 结构：{"summary":"一句给用户看的计划总结","toolName":"workflow.createDraft","toolInput":{"input":"传给工具的完整需求"},"reasoningSummary":"简短说明为什么调用该工具","warnings":[]}',
        ].join('\n'),
    },
    {
      role: 'user',
      content: input.input,
    },
  ];
}

export class AgentPlannerService {
  settings;
  chatCompletion: ChatCompletionRunner;

  constructor(deps: { settings?: DynamicValue; chatCompletion?: ChatCompletionRunner } = {}) {
    this.settings = deps.settings || settingsService;
    this.chatCompletion = deps.chatCompletion || runChatCompletion;
  }

  async createPlan(input: AgentPlanRequest, options: { scope?: DynamicValue } = {}): Promise<AgentPlan> {
    const runtimeConfig = this.settings.buildRuntimeConfig({ configId: input.plannerModel.configId }, options.scope);
    try {
      const response = await this.chatCompletion({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: input.plannerModel.modelId,
        messages: buildPlannerMessages(input),
        temperature: 0.2,
        maxTokens: 900,
        stream: false,
        scope: options.scope,
      });
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const normalized = normalizePlan(readJsonObject(content), input);
      if (normalized) return normalized;
      logger.warn('planner returned unusable plan', { model: input.plannerModel.modelId });
      return fallbackPlan(input, 'Planner 返回内容不是可执行的结构化计划。');
    } catch (error) {
      const normalizedError = error as DynamicValue;
      logger.warn('planner request failed, using fallback plan', {
        code: normalizedError?.code,
        message: normalizedError?.message,
      });
      if (!runtimeConfig.apiKey) {
        throw new ProviderError('AGENT_PLANNER_MODEL_UNAVAILABLE', 'Planner 模型缺少可用 API Key');
      }
      return fallbackPlan(input, normalizedError?.message || 'Planner 调用失败，已回退到本地计划。');
    }
  }
}

export const agentPlannerService = new AgentPlannerService();
