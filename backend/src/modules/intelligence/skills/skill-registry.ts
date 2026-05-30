import { settingsService } from '../../settings/settings.service.ts';
import { workflowsService } from '../../workflows/workflows.service.ts';
import { executionService } from '../../execution/execution.service.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import { KNOWLEDGE_CATEGORIES, knowledgeService } from '../knowledge/knowledge.service.ts';
import { teamOrchestrator } from '../teams/team-orchestrator.ts';
import { workflowBuilderService } from '../workflow-builder/workflow-builder.service.ts';

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

const readOnlySkillSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

const workflowInspectInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workflowId'],
  properties: {
    workflowId: { type: 'string', minLength: 1, maxLength: 120 },
  },
};

const workflowExecutionInputSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    workflowId: { type: 'string', maxLength: 120 },
    workflowName: { type: 'string', maxLength: 200 },
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
  if (typeof input.workflowId === 'string' && input.workflowId.trim()) {
    return workflowsService.getById(input.workflowId.trim(), { scope });
  }
  const workflowName = typeof input.workflowName === 'string' ? input.workflowName.trim().toLowerCase() : '';
  if (!workflowName) return null;
  return (
    workflowsService
      .list({ scope })
      .find((workflow: PlainObject) => String(workflow.name || '').trim().toLowerCase() === workflowName) || null
  );
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
      return {
        nodeId: String(item.id || ''),
        nodeType: String(item.type || ''),
        label: String((item.data as PlainObject)?.label || item.id || `输入 ${index + 1}`),
        aliases: [String(item.id || ''), `${String(item.type || '')}${index + 1}`].filter(Boolean),
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
        description: '读取一个工作流的结构摘要，不修改画布或持久化数据。',
        sideEffect: 'read',
        requiresApproval: false,
        inputSchema: workflowInspectInputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
          },
        },
        execute: (input, options) => ({
          workflow: summarizeWorkflow(workflowsService.getById(String(input.workflowId || ''), { scope: options.scope })),
        }),
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
        execute: (input, options) => ({
          intent: workflowBuilderService.createDraft(
            { input: String(input.input || ''), context: {} },
            { scope: options.scope },
          ).intent,
        }),
      },
      {
        id: 'workflow.plan',
        title: '工作流规划',
        description: '根据需求规划 WorkflowDraft 阶段，不保存、不执行。',
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
            draft: { type: 'object' },
          },
        },
        execute: (input, options) => ({
          draft: workflowBuilderService.createDraft(
            { input: String(input.input || ''), context: {} },
            { scope: options.scope },
          ).draft,
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
              context: {},
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
        execute: (input, options) => workflowBuilderService.validateWorkflow(input.workflow || {}, { scope: options.scope }),
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
