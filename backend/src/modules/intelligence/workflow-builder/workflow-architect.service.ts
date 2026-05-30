import { z } from 'zod';
import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import { createLogger } from '../../../platform/logging/logger.ts';
import { settingsService } from '../../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { WorkflowDraftRequest } from '../intelligence.schema.ts';
import { compileWorkflowArchitectDsl } from './workflow-architect-compiler.ts';
import {
  WORKFLOW_ARCHITECT_NODE_TYPES,
  type WorkflowArchitectDsl,
  workflowArchitectDslSchema,
} from './workflow-architect.schema.ts';
import type { WorkflowDraft } from './workflow-draft.schema.ts';
import type { WorkflowIntent } from './workflow-intent.schema.ts';
import { type WorkflowValidationIssue, validateCompiledWorkflow } from './workflow-validator.ts';

const logger = createLogger({ module: 'workflow-architect-service' });
type ChatCompletionRunner = typeof runChatCompletion;

export type WorkflowArchitectAttempt = {
  source: 'llm' | 'skipped' | 'failed';
  used: boolean;
  reason: string;
  dsl?: WorkflowArchitectDsl;
  issues?: WorkflowValidationIssue[];
};

function cleanText(value: DynamicValue, maxLength = 12000) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function readJsonObject(content: DynamicValue): PlainObject | null {
  const text = cleanText(content);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getPlannerModel(request: WorkflowDraftRequest) {
  const plannerModel = request.context?.agent?.plannerModel;
  const configId = cleanText(plannerModel?.configId, 240);
  const modelId = cleanText(plannerModel?.modelId, 240);
  if (!configId || !modelId) return null;
  return {
    id: cleanText(plannerModel?.id, 240) || modelId,
    modelId,
    configId,
    configName: cleanText(plannerModel?.configName, 240),
    label: cleanText(plannerModel?.label, 300),
  };
}

function summarizeKnowledgeItems(items: DynamicValue[] = []) {
  return items.slice(0, 12).map((item) => ({
    id: cleanText(item.id, 160),
    title: cleanText(item.title, 240),
    category: cleanText(item.category, 80),
    sourceKind: cleanText(item.source?.kind, 80),
    nodeType: cleanText(item.structured?.nodeType, 120),
    content: cleanText(item.content, 900),
    structured: item.structured && typeof item.structured === 'object' ? item.structured : {},
  }));
}

function includesAny(text: string, needles: string[]) {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function getWorkflowNodes(workflow: PlainObject) {
  return Array.isArray(workflow.nodes) ? (workflow.nodes as PlainObject[]) : [];
}

function getWorkflowEdges(workflow: PlainObject) {
  return Array.isArray(workflow.edges) ? (workflow.edges as PlainObject[]) : [];
}

function isComplexRequest(input: WorkflowDraftRequest, intent: WorkflowIntent) {
  const text = `${input.input || ''}\n${intent.sourceText || ''}`;
  return (
    includesAny(text, [
      '素材包',
      '多条链路',
      '多链路',
      '并行链路',
      '复合工作流',
      'asset pack',
      'multi-branch',
      'multiple branches',
    ]) ||
    (includesAny(text, ['主图', '详情页']) && includesAny(text, ['文案', '分镜图', '品牌规范']))
  );
}

function isBatchRequest(input: WorkflowDraftRequest, intent: WorkflowIntent) {
  const text = `${input.input || ''}\n${intent.sourceText || ''}`;
  return includesAny(text, [
    '逐项',
    '批量',
    '每个镜头',
    '每镜头',
    '分镜图',
    '故事板',
    'storyboard shots',
    'batch',
    'for each',
  ]);
}

function isLineSeparator(value: string) {
  return value === '\n' || value === '\\n' || includesAny(value, ['newline', 'line break', '换行', '每行']);
}

function promptMentionsSeparator(prompt: string, separator: string) {
  if (!prompt) return false;
  if (isLineSeparator(separator)) {
    return includesAny(prompt, [
      '每行',
      '一行一个',
      '每一行',
      '按行',
      '换行',
      '不要输出解释',
      'line',
      'newline',
      'one per line',
      'line-separated',
    ]);
  }
  return prompt.includes(separator) || includesAny(prompt, ['分隔符', 'separator', 'delimiter', 'split']);
}

function buildArchitectDslQualityIssues(dsl: WorkflowArchitectDsl) {
  const issues: WorkflowValidationIssue[] = [];
  const nodeMap = new Map(dsl.nodes.map((node) => [node.id, node]));

  for (const node of dsl.nodes.filter((item) => item.type === 'textSplit')) {
    const separator = typeof node.data?.separator === 'string' ? node.data.separator : '';
    if (!separator) {
      issues.push({
        code: 'ARCHITECT_TEXT_SPLIT_SEPARATOR_MISSING',
        message: `文本拆分节点 ${node.id} 必须显式设置 separator，不能依赖默认分隔符。`,
        severity: 'error',
        nodeId: node.id,
      });
    }

    const upstreamAiEdges = dsl.edges.filter((edge) => edge.target === node.id && edge.targetHandle === 'text');
    for (const edge of upstreamAiEdges) {
      const sourceNode = nodeMap.get(edge.source);
      if (sourceNode?.type !== 'aiChat' || edge.sourceHandle !== 'response') continue;
      const systemPrompt = cleanText(sourceNode.data?.systemPrompt, 2400);
      if (!promptMentionsSeparator(systemPrompt, separator || '\n')) {
        issues.push({
          code: 'ARCHITECT_TEXT_SPLIT_UPSTREAM_PROMPT_MISSING_SEPARATOR',
          message: `上游 AI 对话节点 ${sourceNode.id} 连接到 textSplit ${node.id}，systemPrompt 必须明确要求按 textSplit.separator 对齐输出。`,
          severity: 'error',
          nodeId: sourceNode.id,
        });
      }
    }
  }

  return issues;
}

function buildArchitectQualityIssues(workflow: PlainObject, input: WorkflowDraftRequest, intent: WorkflowIntent) {
  const issues: WorkflowValidationIssue[] = [];
  const nodes = getWorkflowNodes(workflow);
  const edges = getWorkflowEdges(workflow);
  const nodeMap = new Map(nodes.map((node) => [String(node.id || ''), node]));
  const countType = (type: string) => nodes.filter((node) => node.type === type).length;
  const countAnyType = (types: string[]) => nodes.filter((node) => types.includes(String(node.type || ''))).length;
  const outputBranches = edges.filter((edge) => nodeMap.get(String(edge.target || ''))?.type === 'output').length;
  const complex = isComplexRequest(input, intent);
  const batch = isBatchRequest(input, intent);

  if (complex) {
    if (countType('aiChat') < 1) {
      issues.push({
        code: 'ARCHITECT_COMPLEX_PLANNER_MISSING',
        message: '复杂需求应至少包含一个承担需求拆解、策略规划或文案规划的 aiChat 节点。',
        severity: 'error',
      });
    }
    if (countAnyType(['imageGen', 'videoGen', 'aiChat']) < 3) {
      issues.push({
        code: 'ARCHITECT_COMPLEX_AI_NODES_TOO_FEW',
        message: '复杂需求应拆成多个 AI 能力节点协同，而不是单个生成节点直接输出。',
        severity: 'error',
      });
    }
    if (outputBranches < 2) {
      issues.push({
        code: 'ARCHITECT_COMPLEX_BRANCHES_TOO_FEW',
        message: '复杂多链路需求应至少有两条最终产物链路汇总到 output。',
        severity: 'error',
      });
    }
  }

  if (batch) {
    const hasSplit = countType('textSplit') > 0;
    const hasIterate = countType('iterateRun') > 0 || countType('iterateImageRun') > 0;
    if (!hasSplit || !hasIterate) {
      issues.push({
        code: 'ARCHITECT_BATCH_CONTROL_MISSING',
        message: '批量/逐项需求应使用 textSplit + iterateRun 或 iterateImageRun 构成逐项运行链路。',
        severity: 'error',
      });
    }
    const iterateIds = new Set(
      nodes
        .filter((node) => ['iterateRun', 'iterateImageRun'].includes(String(node.type || '')))
        .map((node) => String(node.id || '')),
    );
    const hasIterateAiDownstream = edges.some((edge) => {
      if (!iterateIds.has(String(edge.source || ''))) return false;
      const targetType = String(nodeMap.get(String(edge.target || ''))?.type || '');
      return ['aiChat', 'imageGen', 'videoGen'].includes(targetType);
    });
    if (hasIterate && !hasIterateAiDownstream) {
      issues.push({
        code: 'ARCHITECT_BATCH_DOWNSTREAM_MISSING',
        message: '逐项运行节点应连接到下游 AI 能力节点，让每个 item 分别执行生成或处理。',
        severity: 'error',
      });
    }
  }

  if (complex || batch) {
    for (const node of nodes.filter((item) => item.type === 'aiChat')) {
      if (!cleanText(node.data?.systemPrompt, 1200)) {
        issues.push({
          code: 'ARCHITECT_AI_ROLE_PROMPT_MISSING',
          message: `AI 对话节点 ${String(node.id || '')} 应设置明确角色和任务边界的 systemPrompt。`,
          severity: 'error',
          nodeId: String(node.id || ''),
        });
      }
    }
    for (const node of nodes.filter((item) => item.type === 'imageGen')) {
      const configured = ['ratio', 'resolution', 'n', 'output_format'].filter(
        (key) => node.data?.[key] !== undefined && node.data?.[key] !== '',
      );
      if (configured.length < 2) {
        issues.push({
          code: 'ARCHITECT_IMAGE_PARAMS_TOO_WEAK',
          message: `图像生成节点 ${String(node.id || '')} 应根据需求设置 ratio、resolution、n、output_format 等关键参数。`,
          severity: 'error',
          nodeId: String(node.id || ''),
        });
      }
    }
    for (const node of nodes.filter((item) => item.type === 'videoGen')) {
      const configured = ['duration', 'resolution', 'ratio'].filter(
        (key) => node.data?.[key] !== undefined && node.data?.[key] !== '',
      );
      if (configured.length < 2) {
        issues.push({
          code: 'ARCHITECT_VIDEO_PARAMS_TOO_WEAK',
          message: `视频生成节点 ${String(node.id || '')} 应根据需求设置 duration、resolution、ratio 等关键参数。`,
          severity: 'error',
          nodeId: String(node.id || ''),
        });
      }
    }
  }

  return issues;
}

function validateArchitectWorkflow(
  workflow: PlainObject,
  input: WorkflowDraftRequest,
  intent: WorkflowIntent,
  options: { scope?: DynamicValue } = {},
) {
  const validation = validateCompiledWorkflow(workflow, { scope: options.scope });
  const qualityIssues = validation.workflow ? buildArchitectQualityIssues(validation.workflow, input, intent) : [];
  const issues = [...validation.issues, ...qualityIssues];
  return {
    valid: Boolean(validation.workflow) && !issues.some((issue) => issue.severity === 'error'),
    workflow: validation.workflow,
    issues,
  };
}

function buildArchitectMessages(input: {
  request: WorkflowDraftRequest;
  intent: WorkflowIntent;
  draft: WorkflowDraft;
  knowledgeItems: DynamicValue[];
}) {
  return [
    {
      role: 'system',
      content: [
        '你是 SueLr-Studio 的 Workflow Architect。',
        '你的任务是把用户需求设计成受控工作流 DSL，而不是写提示词教程。',
        '只能使用允许的节点类型和端口；输出必须是一个 JSON 对象，不要 Markdown。',
        '优先设计真实可运行的多节点链路：输入节点、规划/拆解 aiChat、生成节点、saveFile、output。',
        '复杂任务可以使用多条并行链路、多个 aiChat/imageGen/videoGen、textSplit、iterateRun。',
        '复杂素材包不要压成单链路：按结果拆成主图链路、详情页链路、文案链路、分镜/视频链路等，每条链路独立 saveFile 后汇总 output。',
        '多个 aiChat 应有不同职责：需求拆解/设计策略、分镜规划、文案生成、质检总结；不要把所有任务塞进一个通用提示词节点。',
        '分镜图、故事板图片、storyboard sheet 属于图片序列/图片生成任务，不要用 videoGen；最终成片或视频文件才用 videoGen。',
        'iterateRun 是控制节点：把 textSplit 的 part1..partN 接到 item1..itemN，再把 iterateRun.text 接到下游生成节点。',
        '批量任务必须显式使用 textSplit + iterateRun/iterateImageRun，把每个片段或素材逐项传给下游 AI 节点。',
        '使用 textSplit 时必须显式设置 data.separator；如果上游是 aiChat，aiChat.systemPrompt 必须明确要求按同一个分隔符输出，例如 separator 为 "\\n" 时要求“每行一个片段，不要输出解释”。',
        'promptHelper 不是通用提示词优化器；除非需要本地参数化的镜头、光照、三视图或 storyboard sheet 控制，否则不要使用。',
        '必须根据需求填好关键参数：aiChat.systemPrompt、imageGen.ratio/resolution/n/output_format、videoGen.duration/resolution/ratio、saveFile.filenamePrefix、textSplit.separator/outputCount。',
        '每个最终产物链路都应该经过 saveFile，再汇总到 output。',
        'JSON 结构：{"name":"","description":"","nodes":[{"id":"","type":"textInput","data":{},"position":{"x":0,"y":0},"purpose":""}],"edges":[{"source":"","sourceHandle":"","target":"","targetHandle":""}],"settings":{"workflowExecution":{"enabled":true,"maxConcurrency":4}},"reasoningSummary":"","warnings":[]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户需求：${input.request.input}`,
        '',
        `解析意图：${JSON.stringify({
          domain: input.intent.domain,
          outputCount: input.intent.outputCount,
          requiresImageInput: input.intent.requiresImageInput,
          requiresVideoInput: input.intent.requiresVideoInput,
          requiresAudioInput: input.intent.requiresAudioInput,
        })}`,
        '',
        `本地阶段草案：${JSON.stringify(input.draft.stages.map((stage) => ({ id: stage.id, nodeType: stage.nodeType, purpose: stage.purpose })))}`,
        '',
        `允许节点类型：${JSON.stringify(WORKFLOW_ARCHITECT_NODE_TYPES)}`,
        '',
        `关键端口约定：${JSON.stringify({
          textInput: { outputs: ['text'] },
          imageInput: { outputs: ['image', 'mask'] },
          videoInput: { outputs: ['video'] },
          audioInput: { outputs: ['audio'] },
          aiChat: { inputs: ['prompt', 'image', 'apiKey'], outputs: ['response'] },
          imageGen: { inputs: ['prompt', 'reference', 'mask', 'apiKey'], outputs: ['images'] },
          videoGen: { inputs: ['prompt', 'reference', 'video', 'audio', 'apiKey'], outputs: ['video'] },
          textSplit: { inputs: ['text'], outputs: ['part1..part9'], params: ['separator', 'outputCount'] },
          iterateRun: { inputs: ['item1..item9'], outputs: ['text'] },
          saveFile: { inputs: ['content'], outputs: ['content'] },
          output: { inputs: ['content', 'content2', 'content3', 'content4', 'content5'] },
        })}`,
        '',
        `复杂工作流参考结构：${JSON.stringify({
          ecommerceAssetPack: [
            'textInput/imageInput -> aiChat(设计策略拆解)',
            '策略 -> imageGen(主图参数: ratio 1:1, n 2-4) -> saveFile -> output.content',
            '策略 -> imageGen(详情页首屏参数: ratio 16:9) -> saveFile -> output.content2',
            '策略 -> aiChat(文案生成) -> saveFile -> output.content3',
            '策略 -> textSplit(separator="\\n", outputCount=镜头数) -> iterateRun -> imageGen(分镜图) -> saveFile -> output.content4',
          ],
          batchStoryboard: [
            'textInput(脚本) -> aiChat(拆镜头；systemPrompt 必须写“每行一个镜头，不要输出解释”)',
            'aiChat.response -> textSplit(separator="\\n", outputCount=镜头数)',
            'textSplit.part1..partN -> iterateRun.item1..itemN',
            'iterateRun.text -> imageGen(每个镜头图，n=1, ratio 按横/竖屏需求设置) -> saveFile -> output',
          ],
        })}`,
        '',
        `本地知识库上下文：${JSON.stringify(summarizeKnowledgeItems(input.knowledgeItems))}`,
      ].join('\n'),
    },
  ];
}

function buildRepairMessages(input: {
  request: WorkflowDraftRequest;
  intent: WorkflowIntent;
  draft: WorkflowDraft;
  knowledgeItems: DynamicValue[];
  dsl: WorkflowArchitectDsl;
  issues: WorkflowValidationIssue[];
}) {
  return [
    ...buildArchitectMessages(input),
    {
      role: 'assistant',
      content: JSON.stringify(input.dsl),
    },
    {
      role: 'user',
      content: [
        '上一次 DSL 未通过工作流校验。请根据下面的校验问题修复，并返回完整 JSON 对象，不要解释，不要 Markdown。',
        '',
        `校验问题：${JSON.stringify(
          input.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            nodeId: issue.nodeId,
            edgeId: issue.edgeId,
            severity: issue.severity,
          })),
        )}`,
        '',
        '修复要求：',
        '1. 所有边必须使用真实存在的节点和端口。',
        '2. aiChat/imageGen/videoGen/textSplit/saveFile/output 的必需输入必须连接。',
        '3. textSplit 只能输出 part1..partN；iterateRun/merge 节点只能接 item1..itemN。',
        '4. 最终可见结果必须汇总到 output，最终产物链路优先经过 saveFile。',
        '5. 如果是复杂或批量需求，不能只修成“能连通”的简单链路；必须保留多链路、多 AI 节点、逐项运行和关键参数设置。',
        '6. textSplit 必须显式设置 separator；上游 aiChat.systemPrompt 必须说明按同一个分隔符输出。',
      ].join('\n'),
    },
  ];
}

export class WorkflowArchitectService {
  settings;
  chatCompletion: ChatCompletionRunner;

  constructor(deps: { settings?: DynamicValue; chatCompletion?: ChatCompletionRunner } = {}) {
    this.settings = deps.settings || settingsService;
    this.chatCompletion = deps.chatCompletion || runChatCompletion;
  }

  async tryCreateWorkflow(
    request: WorkflowDraftRequest,
    intent: WorkflowIntent,
    draft: WorkflowDraft,
    options: { scope?: DynamicValue; knowledgeItems?: DynamicValue[] } = {},
  ) {
    const plannerModel = getPlannerModel(request);
    if (!plannerModel) {
      return {
        workflow: null,
        attempt: {
          source: 'skipped',
          used: false,
          reason: '没有选择 Agent planner 模型，使用本地工作流编排。',
        } satisfies WorkflowArchitectAttempt,
      };
    }

    const runtimeConfig = this.settings.buildRuntimeConfig({ configId: plannerModel.configId }, options.scope);
    if (!runtimeConfig.apiKey) {
      return {
        workflow: null,
        attempt: {
          source: 'skipped',
          used: false,
          reason: 'Planner 模型缺少可用 API Key，使用本地工作流编排。',
        } satisfies WorkflowArchitectAttempt,
      };
    }

    try {
      const response = await this.chatCompletion({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: plannerModel.modelId,
        messages: buildArchitectMessages({
          request,
          intent,
          draft,
          knowledgeItems: options.knowledgeItems || [],
        }),
        temperature: 0.15,
        maxTokens: 4200,
        stream: false,
        scope: options.scope,
      });
      const payload = await response.json();
      const raw = readJsonObject(payload?.choices?.[0]?.message?.content);
      const dsl = workflowArchitectDslSchema.parse(raw);
      const workflow = compileWorkflowArchitectDsl(dsl, intent, draft, { scope: options.scope });
      const validation = validateArchitectWorkflow(workflow, request, intent, { scope: options.scope });
      const dslQualityIssues = buildArchitectDslQualityIssues(dsl);
      validation.issues.push(...dslQualityIssues);
      validation.valid = validation.valid && !dslQualityIssues.some((issue) => issue.severity === 'error');
      if (!validation.valid || !validation.workflow) {
        const repairResponse = await this.chatCompletion({
          apiKey: runtimeConfig.apiKey,
          baseUrl: runtimeConfig.baseUrl,
          providerConfig: runtimeConfig.providerConfig,
          projectModels: runtimeConfig.projectModels,
          model: plannerModel.modelId,
          messages: buildRepairMessages({
            request,
            intent,
            draft,
            knowledgeItems: options.knowledgeItems || [],
            dsl,
            issues: validation.issues,
          }),
          temperature: 0.05,
          maxTokens: 4200,
          stream: false,
          scope: options.scope,
        });
        const repairPayload = await repairResponse.json();
        const repairedRaw = readJsonObject(repairPayload?.choices?.[0]?.message?.content);
        const repairedDsl = workflowArchitectDslSchema.parse(repairedRaw);
        const repairedWorkflow = compileWorkflowArchitectDsl(repairedDsl, intent, draft, { scope: options.scope });
        const repairedValidation = validateArchitectWorkflow(repairedWorkflow, request, intent, {
          scope: options.scope,
        });
        const repairedDslQualityIssues = buildArchitectDslQualityIssues(repairedDsl);
        repairedValidation.issues.push(...repairedDslQualityIssues);
        repairedValidation.valid =
          repairedValidation.valid && !repairedDslQualityIssues.some((issue) => issue.severity === 'error');
        if (repairedValidation.valid && repairedValidation.workflow) {
          return {
            workflow: repairedValidation.workflow,
            attempt: {
              source: 'llm',
              used: true,
              reason: '已使用 LLM Architect 生成受控工作流 DSL，并根据校验结果自动修复了一次。',
              dsl: repairedDsl,
              issues: repairedValidation.issues,
            } satisfies WorkflowArchitectAttempt,
          };
        }
        return {
          workflow: null,
          attempt: {
            source: 'failed',
            used: false,
            reason: 'LLM Architect 生成的 DSL 未通过工作流校验，自动修复后仍无效，已回退本地编排。',
            dsl: repairedDsl,
            issues: [...validation.issues, ...repairedValidation.issues],
          } satisfies WorkflowArchitectAttempt,
        };
      }
      return {
        workflow: validation.workflow,
        attempt: {
          source: 'llm',
          used: true,
          reason: '已使用 LLM Architect 生成受控工作流 DSL。',
          dsl,
          issues: validation.issues,
        } satisfies WorkflowArchitectAttempt,
      };
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? 'LLM Architect 返回的 DSL 结构无效。'
          : error instanceof Error
            ? error.message
            : 'LLM Architect 调用失败。';
      logger.warn('workflow architect failed, using local compiler', {
        model: plannerModel.modelId,
        error: message,
      });
      return {
        workflow: null,
        attempt: {
          source: 'failed',
          used: false,
          reason: `${message} 已回退本地编排。`,
        } satisfies WorkflowArchitectAttempt,
      };
    }
  }
}

export const workflowArchitectService = new WorkflowArchitectService();
