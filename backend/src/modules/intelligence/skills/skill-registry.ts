import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import { executionService } from '../../execution/execution.service.ts';
import { imagesService } from '../../images/images.service.ts';
import { settingsService } from '../../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import { workflowsService } from '../../workflows/workflows.service.ts';
import { KNOWLEDGE_CATEGORIES, knowledgeService } from '../knowledge/knowledge.service.ts';
import { teamOrchestrator } from '../teams/team-orchestrator.ts';
import { workflowBuilderService } from '../workflow-builder/workflow-builder.service.ts';
import { workflowEditService } from '../workflow-edit/workflow-edit.service.ts';

export type SkillSideEffect = 'read' | 'suggest' | 'writeDraft' | 'write' | 'execute' | 'external' | 'destructive';

export type IntelligenceSkillDefinition = {
  id: string;
  title: string;
  description: string;
  sideEffect: SkillSideEffect;
  requiresApproval: boolean;
  inputSchema: PlainObject;
  outputSchema: PlainObject;
};

export type SkillRunOptions = {
  scope?: DynamicValue;
};

export type SkillRunResult = {
  skillId: string;
  output: DynamicValue;
};

type SkillExecutor = (input: PlainObject, options: SkillRunOptions) => Promise<DynamicValue> | DynamicValue;

type RegisteredSkill = IntelligenceSkillDefinition & {
  execute: SkillExecutor;
};

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const readOnlySkillSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

const workflowInspectInputSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    workflowId: { type: 'string', minLength: 1, maxLength: 120 },
    workflowName: { type: 'string', maxLength: 200 },
    workflowSnapshot: { type: 'object' },
  },
};

const workflowEditInputSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['input'],
  properties: {
    input: { type: 'string', minLength: 1, maxLength: 12000 },
    workflowId: { type: 'string', maxLength: 120 },
    workflowName: { type: 'string', maxLength: 200 },
    workflowSnapshot: { type: 'object' },
  },
};

const workflowApplyDraftInputSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    workflowId: { type: 'string', maxLength: 120 },
    workflowName: { type: 'string', maxLength: 200 },
    workflowSnapshot: { type: 'object' },
    patch: { type: 'object' },
    workflowEditPatch: { type: 'object' },
    confirmed: { type: 'boolean' },
  },
};

const workflowExecutionInputSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    workflowId: { type: 'string', maxLength: 120 },
    workflowName: { type: 'string', maxLength: 200 },
    workflowSnapshot: { type: 'object' },
    inputs: {
      type: 'object',
      additionalProperties: true,
    },
    confirmed: { type: 'boolean' },
  },
};

const workflowRunInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['runId'],
  properties: {
    runId: { type: 'string', minLength: 1, maxLength: 200 },
  },
};

const knowledgeSearchInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', maxLength: 2000 },
    categories: {
      type: 'array',
      items: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES] },
      maxItems: KNOWLEDGE_CATEGORIES.length,
    },
    limit: { type: 'number', minimum: 1, maximum: 50 },
  },
};

const knowledgeWriteInputSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['category', 'title', 'content'],
  properties: {
    category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES] },
    title: { type: 'string', minLength: 1, maxLength: 240 },
    content: { type: 'string', minLength: 1, maxLength: 12000 },
    confirmed: { type: 'boolean' },
  },
};

const teamRunInputSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['input'],
  properties: {
    input: { type: 'string', minLength: 1, maxLength: 12000 },
    teamId: { type: 'string', maxLength: 120 },
  },
};

function listProviderModels(scope?: DynamicValue) {
  const settings = settingsService.getSettingsResponse(scope) as PlainObject;
  const configs = Array.isArray(settings?.configs) ? settings.configs : [];
  return configs.map((config: PlainObject) => ({
    configId: String(config.id || ''),
    name: String(config.name || ''),
    baseUrl: String(config.baseUrl || config.base || ''),
    active: config.id === settings?.activeConfigId,
    models: Array.isArray(config.models) ? config.models : [],
  }));
}

function summarizeWorkflow(workflow: PlainObject) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
    edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
    updatedAt: workflow.updatedAt,
    ownerUserId: workflow.ownerUserId,
    workspaceId: workflow.workspaceId,
    ownershipScope: workflow.ownershipScope,
  };
}

function getWorkflowForInputHints(input: PlainObject, scope?: DynamicValue) {
  if (isPlainObject(input.workflowSnapshot)) {
    return input.workflowSnapshot;
  }
  if (typeof input.workflowId === 'string' && input.workflowId.trim()) {
    return workflowsService.getById(input.workflowId.trim(), { scope });
  }
  const workflowName = typeof input.workflowName === 'string' ? input.workflowName.trim().toLowerCase() : '';
  if (!workflowName) return null;
  return (
    workflowsService.list({ scope }).find(
      (workflow: PlainObject) =>
        String(workflow.name || '')
          .trim()
          .toLowerCase() === workflowName,
    ) || null
  );
}

function stringifyInputDefaultValue(value: DynamicValue) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeInputNodes(workflow: PlainObject | null) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  return nodes
    .filter((node: DynamicValue) => {
      const type = String((node as PlainObject)?.type || '');
      return ['textInput', 'imageInput', 'videoInput', 'audioInput', 'maskInput'].includes(type);
    })
    .map((node: DynamicValue, index: number) => {
      const item = node as PlainObject;
      const data = item.data as PlainObject;
      const nodeType = String(item.type || '');
      const currentValue =
        nodeType === 'textInput'
          ? stringifyInputDefaultValue(data?.text)
          : stringifyInputDefaultValue(data?.fileUrl || data?.maskFileUrl || data?.maskPreviewUrl);
      return {
        nodeId: String(item.id || ''),
        nodeType,
        kind:
          nodeType === 'textInput'
            ? 'text'
            : nodeType === 'imageInput'
              ? 'image'
              : nodeType === 'videoInput'
                ? 'video'
                : nodeType === 'audioInput'
                  ? 'audio'
                  : 'mask',
        label: String(data?.label || item.id || `输入 ${index + 1}`),
        aliases: [String(item.id || ''), `${nodeType}${index + 1}`].filter(Boolean),
        currentValue,
      };
    });
}

function buildRunDiagnosis(status: PlainObject) {
  const state = String(status.status || 'idle');
  if (state === 'completed') {
    return {
      severity: 'info',
      summary: '工作流已完成。',
      suggestions: ['查看结果面板中的输出资产和节点日志。'],
    };
  }
  if (state === 'running') {
    return {
      severity: 'info',
      summary: '工作流仍在执行中。',
      suggestions: ['等待执行结束，或通过现有取消接口显式取消。'],
    };
  }
  if (state === 'cancelled') {
    return {
      severity: 'warning',
      summary: '工作流已取消。',
      suggestions: ['确认取消原因后，可调整输入并重新执行。'],
    };
  }
  if (state === 'failed') {
    const error = String(status.error || '执行失败，未返回详细错误。');
    return {
      severity: 'error',
      summary: error,
      suggestions: [
        '检查失败节点的输入是否为空或格式不匹配。',
        '确认所需模型、Provider 配置和运行额度可用。',
        '根据运行日志修正节点参数后重新执行。',
      ],
    };
  }
  return {
    severity: 'warning',
    summary: '没有找到正在执行或最近完成的运行记录。',
    suggestions: ['确认 runId 是否来自当前请求作用域，或重新执行工作流。'],
  };
}

function buildRunSummary(status: PlainObject, executionSummary: PlainObject | null) {
  const artifacts = Array.isArray(executionSummary?.artifacts) ? executionSummary.artifacts.slice(0, 12) : [];
  const keyOutputs = Array.isArray(executionSummary?.keyOutputs) ? executionSummary.keyOutputs.slice(0, 6) : [];
  const runId = String(status.runId || executionSummary?.runId || '');
  const parts = [
    `运行 ${runId} 当前状态：${String(status.status || 'unknown')}`,
    status.workflowId ? `工作流：${status.workflowId}` : '',
    Number.isFinite(status.successCount) ? `成功节点：${status.successCount}` : '',
    Number.isFinite(status.failCount) ? `失败节点：${status.failCount}` : '',
    status.error ? `错误：${status.error}` : '',
  ].filter(Boolean);

  return {
    runId,
    status,
    summary: `${parts.join('，')}。`,
    report: {
      workflowId: String(executionSummary?.workflowId || status.workflowId || ''),
      workflowName: String(executionSummary?.workflowName || ''),
      totalDuration: executionSummary?.totalDuration ?? status.totalDuration,
      successCount: executionSummary?.successCount ?? status.successCount,
      failCount: executionSummary?.failCount ?? status.failCount,
      keyOutputs,
      artifacts,
      text: typeof executionSummary?.summary === 'string' ? executionSummary.summary : '',
    },
  };
}

export class SkillRegistry {
  private skills: RegisteredSkill[];

  constructor() {
    this.skills = [
      {
        id: 'knowledge.search',
        title: '知识检索',
        description: '检索本地 Studio Brain JSON 知识库，只返回上下文建议，不自动执行工作流。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: knowledgeSearchInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            items: { type: 'array' },
            source: { type: 'string' },
          },
        },
        execute: (input, options) => knowledgeService.search(input, { scope: options.scope }),
      },
      {
        id: 'knowledge.write',
        title: '知识写入',
        description: '写入本地 Studio Brain JSON 知识库。品牌规则和项目规则需要用户确认。',
        sideEffect: 'write',
        requiresApproval: true,
        inputSchema: knowledgeWriteInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            record: { type: 'object' },
          },
        },
        execute: (input, options) => knowledgeService.write(input, { scope: options.scope }),
      },
      {
        id: 'knowledge.importLegacyMemory',
        title: '旧记忆导入',
        description: '把旧 Agent memory 导入本地 Studio Brain 的 user-memory 分类。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: readOnlySkillSchema,
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            imported: { type: 'number' },
          },
        },
        execute: (_input, options) => knowledgeService.importLegacyMemory({ scope: options.scope }),
      },
      {
        id: 'knowledge.rebuildSeeds',
        title: '重建初始知识',
        description: '从系统节点能力、已保存工作流和本地模型配置重建可追溯的初始知识索引。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: readOnlySkillSchema,
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            categories: { type: 'object' },
          },
        },
        execute: (_input, options) => knowledgeService.rebuildSeedKnowledge({ scope: options.scope }),
      },
      {
        id: 'knowledge.linkAsset',
        title: '结果文件入库',
        description: '把运行时相对 URL 的结果文件写入素材知识库，不保存绝对路径。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          required: ['url'],
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 1000 },
            title: { type: 'string', maxLength: 160 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            record: { type: 'object' },
          },
        },
        execute: (input, options) => knowledgeService.linkAsset(input, { scope: options.scope }),
      },
      {
        id: 'knowledge.summarizeRun',
        title: '运行经验入库',
        description: '把真实 workflow run trace 总结为运行知识。必须能找到对应 run trace。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: workflowRunInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            record: { type: 'object' },
          },
        },
        execute: (input, options) => knowledgeService.summarizeRun(input, { scope: options.scope }),
      },
      {
        id: 'knowledge.extractPreference',
        title: '偏好提取',
        description: '从用户明确表达的偏好文本中提取低风险 user-memory。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 12000 },
            title: { type: 'string', maxLength: 120 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            record: { type: 'object' },
          },
        },
        execute: (input, options) => knowledgeService.extractPreference(input, { scope: options.scope }),
      },
      {
        id: 'knowledge.promoteToTemplate',
        title: '模板沉淀',
        description: '把用户确认的工作流经验保存为可复用模板知识。',
        sideEffect: 'write',
        requiresApproval: true,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            confirmed: { type: 'boolean' },
            workflowId: { type: 'string', maxLength: 200 },
            title: { type: 'string', maxLength: 160 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            record: { type: 'object' },
          },
        },
        execute: (input, options) => knowledgeService.promoteToTemplate(input, { scope: options.scope }),
      },
      {
        id: 'workflow.list',
        title: '工作流列表',
        description: '列出当前作用域可见的工作流摘要。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: readOnlySkillSchema,
        outputSchema: {
          type: 'object',
          properties: {
            workflows: { type: 'array' },
          },
        },
        execute: (_input, options) => ({
          workflows: workflowsService.list({ scope: options.scope }),
        }),
      },
      {
        id: 'team.list',
        title: '团队模板列表',
        description: '列出本地可用的设计团队模板，不创建任务、不调用模型。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: readOnlySkillSchema,
        outputSchema: {
          type: 'object',
          properties: {
            teams: { type: 'array' },
          },
        },
        execute: () => teamOrchestrator.listTemplates(),
      },
      {
        id: 'team.run',
        title: '本地设计团队运行',
        description: '用本地规则团队拆解需求、运行角色、生成评审和工作流草案。应用草案或执行工作流仍需用户确认。',
        sideEffect: 'writeDraft',
        requiresApproval: false,
        inputSchema: teamRunInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            team: { type: 'object' },
            plan: { type: 'object' },
            roleOutputs: { type: 'array' },
            review: { type: 'object' },
            workflowDraft: { type: 'object' },
            trace: { type: 'array' },
            approvalsRequired: { type: 'array' },
          },
        },
        execute: (input, options) => teamOrchestrator.run(input, { scope: options.scope }),
      },
      {
        id: 'workflow.inspect',
        title: '工作流检查',
        description: '读取当前工作流画布或已保存工作流的结构摘要，不修改画布或持久化数据。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: workflowInspectInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
          },
        },
        execute: (input, options) => workflowEditService.inspect(input, { scope: options.scope }),
      },
      {
        id: 'workflow.edit',
        title: '生成工作流修改草案',
        description: '基于当前画布和用户要求生成可校验 patch 预览，不直接修改 React Flow 状态。',
        sideEffect: 'writeDraft',
        requiresApproval: false,
        inputSchema: workflowEditInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
            patch: { type: 'object' },
          },
        },
        execute: (input, options) => workflowEditService.edit(input, { scope: options.scope }),
      },
      {
        id: 'workflow.applyDraft',
        title: '应用工作流修改草案',
        description: '预览并确认后把 patch 转成新的本地画布快照返回前端，不直接写入后端工作流存储。',
        sideEffect: 'writeDraft',
        requiresApproval: true,
        inputSchema: workflowApplyDraftInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            approvalRequired: { type: 'boolean' },
            workflow: { type: 'object' },
            patch: { type: 'object' },
          },
        },
        execute: (input, options) => workflowEditService.applyDraft(input, { scope: options.scope }),
      },
      {
        id: 'model.list',
        title: '模型列表',
        description: '列出当前本地配置中的 provider 模型摘要，不触发模型发现或外部请求。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: readOnlySkillSchema,
        outputSchema: {
          type: 'object',
          properties: {
            providers: { type: 'array' },
          },
        },
        execute: (_input, options) => ({
          providers: listProviderModels(options.scope),
        }),
      },
      {
        id: 'brief.parse',
        title: 'Brief 解析',
        description: '把自然语言需求解析成 WorkflowIntent，不写入工作流。',
        sideEffect: 'suggest',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          required: ['input'],
          properties: {
            input: { type: 'string', minLength: 1, maxLength: 12000 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            intent: { type: 'object' },
          },
        },
        execute: async (input, options) => ({
          intent: (
            await workflowBuilderService.createDraft(
              { input: String(input.input || ''), context: {} },
              { scope: options.scope },
            )
          ).intent,
        }),
      },
      {
        id: 'workflow.createDraft',
        title: '创建工作流草案',
        description: '生成可预览的工作流草案 JSON。应用、保存、执行都需要用户确认。',
        sideEffect: 'writeDraft',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          required: ['input'],
          properties: {
            input: { type: 'string', minLength: 1, maxLength: 12000 },
            name: { type: 'string', maxLength: 200 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
            validation: { type: 'object' },
            approvalsRequired: { type: 'array' },
          },
        },
        execute: (input, options) =>
          workflowBuilderService.createDraft(
            {
              input: String(input.input || ''),
              name: typeof input.name === 'string' ? input.name : undefined,
              context:
                input.context && typeof input.context === 'object' && !Array.isArray(input.context)
                  ? input.context
                  : {},
            },
            { scope: options.scope },
          ),
      },
      {
        id: 'workflow.validate',
        title: '校验工作流草案',
        description: '校验草案是否能编译为合法工作流 JSON，不保存、不执行。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          required: ['workflow'],
          properties: {
            workflow: { type: 'object' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            issues: { type: 'array' },
          },
        },
        execute: (input, options) =>
          workflowBuilderService.validateWorkflow(input.workflow || {}, { scope: options.scope }),
      },
      {
        id: 'workflow.suggestInputs',
        title: '建议工作流输入',
        description: '读取已保存工作流的输入节点，给出执行前需要用户确认的输入项。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: workflowExecutionInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
            requiredInputs: { type: 'array' },
          },
        },
        execute: (input, options) => {
          const workflow = getWorkflowForInputHints(input, options.scope);
          return {
            workflow: workflow ? summarizeWorkflow(workflow) : null,
            requiredInputs: summarizeInputNodes(workflow),
            note: workflow
              ? '执行前请确认这些输入项；输入覆盖只作用于本次运行。'
              : '请先提供已保存工作流的 workflowId 或 workflowName。',
          };
        },
      },
      {
        id: 'workflow.execute',
        title: '执行已保存工作流',
        description: '通过现有 ExecutionService 执行已保存工作流。必须由用户显式确认后才会运行。',
        sideEffect: 'execute',
        requiresApproval: true,
        inputSchema: workflowExecutionInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            approvalRequired: { type: 'boolean' },
            run: { type: 'object' },
          },
        },
        execute: async (input, options) => {
          if (input.confirmed !== true) {
            return {
              approvalRequired: true,
              approvalCode: 'executeWorkflow',
              message: '执行工作流需要用户显式确认。确认后请带 confirmed: true 再调用。',
              requestedTarget: {
                workflowId: input.workflowId || '',
                workflowName: input.workflowName || '',
              },
              suggestedInputs: summarizeInputNodes(getWorkflowForInputHints(input, options.scope)),
            };
          }

          const run = await executionService.executeForAgent({
            workflowId: typeof input.workflowId === 'string' ? input.workflowId : '',
            workflowName: typeof input.workflowName === 'string' ? input.workflowName : '',
            workflowSnapshot: isPlainObject(input.workflowSnapshot) ? input.workflowSnapshot : undefined,
            inputs: input.inputs,
            apiConfig: {},
            requestId: 'intelligence-workflow',
            scope: options.scope,
          });
          return {
            approvalRequired: false,
            run,
          };
        },
      },
      {
        id: 'workflow.diagnose',
        title: '诊断工作流运行',
        description: '读取现有执行状态，给出节点级诊断前的运行状态建议。不取消、不重试。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: workflowRunInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            status: { type: 'object' },
            diagnosis: { type: 'object' },
          },
        },
        execute: (input, options) => {
          const runId = String(input.runId || '');
          const status = executionService.getStatus(runId, { scope: options.scope });
          return {
            runId,
            status,
            diagnosis: buildRunDiagnosis(status),
          };
        },
      },
      {
        id: 'workflow.summarizeRun',
        title: '总结工作流运行',
        description: '总结现有执行状态和结果指标，供用户复盘。不写入知识库。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: workflowRunInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            status: { type: 'object' },
            summary: { type: 'string' },
            report: { type: 'object' },
          },
        },
        execute: (input, options) => {
          const runId = String(input.runId || '');
          const status = executionService.getStatus(runId, { scope: options.scope });
          return buildRunSummary(status, executionService.getRecentRunSummary(runId, { scope: options.scope }));
        },
      },
      {
        id: 'image.generate',
        title: '图片生成',
        description:
          '直接调用图片生成模型生成图片，不经过工作流。适合快速单张或多张出图。大规模或批次生成应使用工作流。',
        sideEffect: 'execute',
        requiresApproval: true,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          required: ['prompt'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 4000 },
            model: { type: 'string', maxLength: 240 },
            ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'] },
            resolution: { type: 'string', maxLength: 80 },
            n: { type: 'number', minimum: 1, maximum: 8 },
            output_format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
            reference: { type: 'string', maxLength: 2000, description: '图生图参考图片 URL 或 base64' },
            mask: { type: 'string', maxLength: 2000, description: '局部编辑遮罩 URL 或 base64' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            images: { type: 'array' },
            model: { type: 'string' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const targetConfig = String(input.configId || '')
            ? configs.find((config) => String(config.id || '') === input.configId)
            : undefined;
          const runtimeConfig = settingsService.buildRuntimeConfig(
            targetConfig || configs[0] || {},
            options.scope,
          );
          return imagesService.generate(
            {
              prompt: String(input.prompt || ''),
              model: String(input.modelId || input.model || ''),
              ratio: input.ratio || 'auto',
              resolution: input.resolution || '1k',
              n: Math.min(4, Math.max(1, Number(input.n) || 1)),
              output_format: input.output_format || 'png',
              ...(input.reference ? { reference: input.reference } : {}),
              ...(input.mask ? { mask: input.mask } : {}),
            },
            { scope: options.scope },
          );
        },
      },
      {
        id: 'image.edit',
        title: '图片编辑',
        description: '基于参考图片和提示词进行图生图编辑或局部修改。需要提供 reference 图片 URL 或 base64。',
        sideEffect: 'execute',
        requiresApproval: true,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          required: ['prompt', 'reference'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 4000 },
            reference: { type: 'string', minLength: 1, maxLength: 2000 },
            mask: { type: 'string', maxLength: 2000 },
            model: { type: 'string', maxLength: 240 },
            ratio: { type: 'string', maxLength: 80 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            images: { type: 'array' },
            model: { type: 'string' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const targetConfig = String(input.configId || '')
            ? configs.find((config) => String(config.id || '') === input.configId)
            : undefined;
          const runtimeConfig = settingsService.buildRuntimeConfig(
            targetConfig || configs[0] || {},
            options.scope,
          );
          return imagesService.generate(
            {
              prompt: String(input.prompt || ''),
              model: String(input.modelId || input.model || ''),
              reference: String(input.reference || ''),
              ...(input.mask ? { mask: input.mask } : {}),
            },
            { scope: options.scope },
          );
        },
      },
      {
        id: 'image.edit',
        title: '图片编辑',
        description: '基于参考图片和提示词进行图生图编辑或局部修改。需要提供 reference 图片 URL 或 base64。',
        sideEffect: 'execute',
        requiresApproval: true,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          required: ['prompt', 'reference'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 4000 },
            reference: { type: 'string', minLength: 1, maxLength: 2000 },
            mask: { type: 'string', maxLength: 2000 },
            model: { type: 'string', maxLength: 240 },
            ratio: { type: 'string', maxLength: 80 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            images: { type: 'array' },
            model: { type: 'string' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const activeId = String(settings?.activeConfigId || '');
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const activeConfig = configs.find((config) => String(config.id || '') === activeId) || configs[0] || {};
          const runtimeConfig = settingsService.buildRuntimeConfig(activeConfig, options.scope);
          return imagesService.generate(
            {
              prompt: String(input.prompt || ''),
              model: input.model || '',
              reference: String(input.reference || ''),
              ...(input.mask ? { mask: input.mask } : {}),
            },
            { scope: options.scope },
          );
        },
      },
      {
        id: 'image.compare',
        title: '图片对比',
        description: '接收两张图片 URL 生成并排对比视图，供人工评审环节使用。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['image1', 'image2'],
          properties: {
            image1: { type: 'string', minLength: 1, maxLength: 2000 },
            image2: { type: 'string', minLength: 1, maxLength: 2000 },
            layout: { type: 'string', enum: ['side-by-side', 'overlay', 'split'], default: 'side-by-side' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            comparisonUrl: { type: 'string' },
            layout: { type: 'string' },
          },
        },
        execute: async (input, _options) => ({
          comparisonUrl: null,
          layout: input.layout || 'side-by-side',
          note: '当前为占位实现；后续会生成真正的并排对比图。请使用工作流中的 imageCompare 节点进行实际对比。',
          image1: String(input.image1 || '').slice(0, 120),
          image2: String(input.image2 || '').slice(0, 120),
        }),
      },
      {
        id: 'video.generate',
        title: '视频生成',
        description:
          '直接调用视频生成模型生成短视频/短片。大规模或批次生成应使用工作流。高消耗工具，需要用户确认。',
        sideEffect: 'execute',
        requiresApproval: true,
        inputSchema: {
          type: 'object',
          additionalProperties: true,
          required: ['prompt'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 4000 },
            model: { type: 'string', maxLength: 240 },
            duration: { type: 'number', minimum: 1, maximum: 30 },
            resolution: { type: 'string', maxLength: 80 },
            ratio: { type: 'string', maxLength: 80 },
            reference: { type: 'string', maxLength: 2000, description: '图生视频参考图片 URL' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            video: { type: 'object' },
            model: { type: 'string' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const targetConfig = String(input.configId || '')
            ? configs.find((config) => String(config.id || '') === input.configId)
            : undefined;
          const runtimeConfig = settingsService.buildRuntimeConfig(
            targetConfig || configs[0] || {},
            options.scope,
          );
          return imagesService.generate(
            {
              prompt: String(input.prompt || ''),
              model: String(input.modelId || input.model || ''),
              ratio: input.ratio || '16:9',
              ...(input.duration ? { duration: Number(input.duration) } : {}),
              ...(input.reference ? { reference: input.reference } : {}),
            },
            { scope: options.scope },
          );
        },
      },
      {
        id: 'copy.write',
        title: '文案生成',
        description:
          '调用对话模型直接生成文案、广告语、标题、卖点等营销文本。不创建或修改工作流。',
        sideEffect: 'execute',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 12000 },
            model: { type: 'string', maxLength: 240 },
            tone: { type: 'string', maxLength: 200, description: '语气风格描述' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            model: { type: 'string' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const targetConfig = String(input.configId || '')
            ? configs.find((config) => String(config.id || '') === input.configId)
            : undefined;
          const runtimeConfig = settingsService.buildRuntimeConfig(
            targetConfig || configs[0] || {},
            options.scope,
          );
          const response = await runChatCompletion({
            apiKey: runtimeConfig.apiKey,
            baseUrl: runtimeConfig.baseUrl,
            providerConfig: runtimeConfig.providerConfig,
            projectModels: runtimeConfig.projectModels,
            model: String(input.model || runtimeConfig.projectModels?.[0]?.modelId || ''),
            messages: [
              {
                role: 'system',
                content: [
                  '你是专业的广告文案写手。根据用户需求生成高质量文案。',
                  input.tone ? `语气风格：${String(input.tone)}` : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
              { role: 'user', content: String(input.prompt || '') },
            ],
            temperature: 0.7,
            maxTokens: 2048,
            stream: false,
            scope: options.scope,
          });
          const payload = await response.json();
          const text = String(payload?.choices?.[0]?.message?.content || '');
          return { text, model: String(input.model || '') };
        },
      },
      {
        id: 'prompt.optimize',
        title: '提示词优化',
        description:
          '用对话模型优化用户输入的图片/视频生成提示词，使其更具体、结构化、适合生成模型。不创建工作流。',
        sideEffect: 'suggest',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 12000 },
            model: { type: 'string', maxLength: 240 },
            target: {
              type: 'string',
              enum: ['image', 'video', 'general'],
              description: '优化目标模型类型',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            optimized: { type: 'string' },
            original: { type: 'string' },
            changes: { type: 'array' },
          },
        },
        execute: async (input, options) => {
          const settings = settingsService.getSettingsResponse(options.scope) as PlainObject;
          const configs = Array.isArray(settings?.configs) ? (settings.configs as PlainObject[]) : [];
          const targetConfig = String(input.configId || '')
            ? configs.find((config) => String(config.id || '') === input.configId)
            : undefined;
          const runtimeConfig = settingsService.buildRuntimeConfig(
            targetConfig || configs[0] || {},
            options.scope,
          );
          const targetType = String(input.target || 'general');
          const response = await runChatCompletion({
            apiKey: runtimeConfig.apiKey,
            baseUrl: runtimeConfig.baseUrl,
            providerConfig: runtimeConfig.providerConfig,
            projectModels: runtimeConfig.projectModels,
            model: String(input.model || runtimeConfig.projectModels?.[0]?.modelId || ''),
            messages: [
              {
                role: 'system',
                content: [
                  '你是提示词优化专家。把用户输入的粗糙提示词改写成高质量、结构化提示词。',
                  '列出你做的具体优化项。按以下 JSON 格式输出，不要 Markdown：',
                  '{"optimized":"改写后的完整提示词","changes":["优化项1","优化项2"]}',
                  targetType === 'image'
                    ? '针对图片生成模型优化：强调主体、构图、光线、色彩、风格。'
                    : targetType === 'video'
                      ? '针对视频生成模型优化：强调主体运动、镜头变化、节奏、连续性和时长。'
                      : '通用优化：让提示词更清晰、结构化、易于理解。',
                ].join('\n'),
              },
              { role: 'user', content: String(input.prompt || '') },
            ],
            temperature: 0.4,
            maxTokens: 2048,
            stream: false,
            scope: options.scope,
          });
          const payload = await response.json();
          const raw = String(payload?.choices?.[0]?.message?.content || '');
          let optimized = raw;
          let changes: string[] = [];
          try {
            const parsed = JSON.parse(raw);
            if (parsed.optimized) optimized = String(parsed.optimized);
            if (Array.isArray(parsed.changes)) changes = parsed.changes.map(String);
          } catch {
            // not JSON, use raw text as optimized
          }
          return { optimized, original: String(input.prompt || ''), changes };
        },
      },
      {
        id: 'result.inspect',
        title: '结果检查',
        description: '查看最近一次工作流运行的结果摘要和关键产出物。不重新运行。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            runId: { type: 'string', maxLength: 200 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            status: { type: 'object' },
            summary: { type: 'string' },
            report: { type: 'object' },
          },
        },
        execute: async (input, options) => {
          const runId = String(input.runId || '');
          const status = executionService.getStatus(runId, { scope: options.scope });
          return buildRunSummary(status, executionService.getRecentRunSummary(runId, { scope: options.scope }));
        },
      },
      {
        id: 'asset.package',
        title: '素材打包',
        description:
          '把多个运行时结果或输出文件打包为 ZIP 下载包。适合收集批量生成的全部图片、文案等产物供一次下载。',
        sideEffect: 'write',
        requiresApproval: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['runId'],
          properties: {
            runId: { type: 'string', minLength: 1, maxLength: 200 },
            packageName: { type: 'string', maxLength: 120 },
            includeArtifacts: { type: 'boolean', default: true },
            includeText: { type: 'boolean', default: false },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            packageUrl: { type: 'string' },
            packageName: { type: 'string' },
            fileCount: { type: 'number' },
          },
        },
        execute: async (input, _options) => {
          const runId = String(input.runId || '');
          const status = executionService.getStatus(runId) as PlainObject;
          const summary = executionService.getRecentRunSummary(runId) as PlainObject | null;
          const artifacts = Array.isArray(summary?.artifacts) ? summary.artifacts : [];
          return {
            packageUrl: null,
            packageName: String(input.packageName || `outputs_${runId}`),
            fileCount: artifacts.length,
            note: '当前为占位实现；后续会生成真正的 ZIP 下载包。',
            status: status?.status || 'unknown',
            artifacts: artifacts.slice(0, 20),
          };
        },
      },
    ];
  }

  list(): IntelligenceSkillDefinition[] {
    return this.skills.map(({ execute: _execute, ...definition }) => definition);
  }

  get(id: string) {
    return this.skills.find((skill) => skill.id === id) || null;
  }

  async run(id: string, input: PlainObject = {}, options: SkillRunOptions = {}): Promise<SkillRunResult | null> {
    const skill = this.get(id);
    if (!skill) return null;
    return {
      skillId: skill.id,
      output: await skill.execute(input, options),
    };
  }
}

export const skillRegistry = new SkillRegistry();
