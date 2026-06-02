import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { AgentRunRequest } from '../intelligence.schema.ts';
import { type AgentPlan, agentPlannerService } from '../planner/agent-planner.service.ts';
import { skillRegistry } from '../skills/skill-registry.ts';
import { runTraceRepository } from './run-trace.ts';

type AgentPlannerLike = {
  createPlan(input: AgentRunRequest, options: { scope?: DynamicValue }): Promise<AgentPlan>;
};

type SkillRegistryLike = {
  get(id: string): DynamicValue;
  run(id: string, input: PlainObject, options: { scope?: DynamicValue }): Promise<DynamicValue>;
};

type RunTraceRepositoryLike = {
  create(input: {
    mode: string;
    requestInput: string;
    requestedSkills: string[];
    skillResults: DynamicValue[];
    scope?: DynamicValue;
  }): DynamicValue;
};

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildToolInput(plan: AgentPlan): PlainObject {
  const toolInput: PlainObject = isPlainObject(plan.toolInput) ? plan.toolInput : {};
  if (plan.toolName === 'workflow.createDraft') {
    return {
      ...toolInput,
      context: {
        ...toolInput.context,
        agent: {
          ...(isPlainObject(toolInput.context?.agent) ? toolInput.context.agent : {}),
          plannerModel: plan.plannerModel,
        },
      },
    };
  }
  return toolInput;
}

function buildChatResult(plan: AgentPlan) {
  return {
    skillId: 'chat.respond',
    output: {
      response: String(plan.toolInput.response || plan.summary || ''),
    },
  };
}

function buildToolResponse(toolName: AgentPlan['toolName'], toolResult: DynamicValue) {
  const output = toolResult?.output;
  if (toolName === 'workflow.inspect') {
    return output?.note || (output?.workflow ? '已整理当前工作流摘要。' : '当前没有可检查的工作流画布。');
  }
  if (toolName === 'workflow.edit') {
    return output?.patch?.summary || output?.note || '已生成工作流修改草案。';
  }
  if (toolName === 'workflow.applyDraft') {
    return output?.message || (output?.applied ? '已将修改草案应用到当前画布。' : '当前没有可应用的修改草案。');
  }
  if (toolName === 'workflow.execute') {
    return output?.run?.summary || output?.message || '工作流执行完成。';
  }
  if (toolName === 'workflow.diagnose') {
    return output?.diagnosis?.summary || '已完成运行诊断。';
  }
  if (toolName === 'workflow.summarizeRun') {
    return output?.summary || '已完成运行汇总。';
  }
  return undefined;
}

const APPROVAL_TTL_MS = 10 * 60 * 1000;

type PendingApproval = {
  plan: AgentPlan;
  scopeKey: string;
  expiresAt: number;
};

function buildScopeKey(scope?: DynamicValue) {
  if (!isPlainObject(scope)) return '{}';
  return JSON.stringify({
    userId: scope.userId || '',
    workspaceId: scope.workspaceId || '',
    runtimeMode: scope.runtimeMode || '',
  });
}

function buildApprovedPlan(plan: AgentPlan, approval?: AgentRunRequest['approval']): AgentPlan {
  if (plan.toolName === 'workflow.execute') {
    const mergedInputs = {
      ...(isPlainObject(plan.toolInput.inputs) ? (plan.toolInput.inputs as PlainObject) : {}),
      ...(isPlainObject(approval?.toolInput?.inputs) ? (approval?.toolInput?.inputs as PlainObject) : {}),
    };
    const workflowSnapshot = isPlainObject(approval?.toolInput?.workflowSnapshot)
      ? (approval?.toolInput?.workflowSnapshot as PlainObject)
      : isPlainObject(plan.toolInput.workflowSnapshot)
        ? (plan.toolInput.workflowSnapshot as PlainObject)
        : undefined;
    return {
      ...plan,
      source: 'user-approved',
      toolInput: {
        ...(typeof plan.toolInput.workflowId === 'string' && plan.toolInput.workflowId
          ? { workflowId: plan.toolInput.workflowId }
          : {}),
        ...(typeof plan.toolInput.workflowName === 'string' && plan.toolInput.workflowName
          ? { workflowName: plan.toolInput.workflowName }
          : {}),
        ...(workflowSnapshot ? { workflowSnapshot } : {}),
        inputs: mergedInputs,
        confirmed: true,
      },
      reasoningSummary: '用户已在 Agent 窗口显式确认本次运行，并确认了本次输入覆盖值。',
    };
  }

  const toolInput: PlainObject = { ...plan.toolInput, confirmed: true };
  if (plan.toolName === 'workflow.applyDraft' && isPlainObject(approval?.toolInput?.workflowSnapshot)) {
    toolInput.workflowSnapshot = approval?.toolInput?.workflowSnapshot as PlainObject;
  }
  return {
    ...plan,
    source: 'user-approved',
    toolInput,
    reasoningSummary: '用户已在 Agent 窗口显式确认该工具调用。',
  };
}

function buildWorkflowExecutePreviewOutput(plan: AgentPlan, suggestInputsResult: DynamicValue) {
  const suggestedOutput = suggestInputsResult?.output;
  return {
    approvalRequired: true,
    approvalCode: 'executeWorkflow',
    message: '执行当前工作流前，请先确认输入项和本次覆盖值。',
    workflow: suggestedOutput?.workflow || null,
    requiredInputs: Array.isArray(suggestedOutput?.requiredInputs) ? suggestedOutput.requiredInputs : [],
    inputs: isPlainObject(plan.toolInput.inputs) ? (plan.toolInput.inputs as PlainObject) : {},
  };
}

export class AgentRunner {
  planner: AgentPlannerLike;
  skills: SkillRegistryLike;
  traces: RunTraceRepositoryLike;
  pendingApprovals = new Map<string, PendingApproval>();

  constructor(
    deps: {
      planner?: AgentPlannerLike;
      skills?: SkillRegistryLike;
      traces?: RunTraceRepositoryLike;
    } = {},
  ) {
    this.planner = deps.planner || agentPlannerService;
    this.skills = deps.skills || skillRegistry;
    this.traces = deps.traces || runTraceRepository;
  }

  createPendingApproval(plan: AgentPlan, scope?: DynamicValue) {
    const now = Date.now();
    for (const [id, pending] of this.pendingApprovals) {
      if (pending.expiresAt < now) this.pendingApprovals.delete(id);
    }
    const id = `approval_${randomUUID()}`;
    this.pendingApprovals.set(id, {
      plan,
      scopeKey: buildScopeKey(scope),
      expiresAt: now + APPROVAL_TTL_MS,
    });
    return {
      id,
      toolName: plan.toolName,
      toolInput: buildToolInput(plan),
      summary: plan.summary,
    };
  }

  consumePendingApproval(input: AgentRunRequest, scope?: DynamicValue) {
    const approval = input.approval;
    if (!approval) throw new ValidationError('AGENT_TOOL_APPROVAL_MISSING', '缺少待确认工具');
    const pending = this.pendingApprovals.get(approval.id);
    this.pendingApprovals.delete(approval.id);
    if (!pending || pending.expiresAt < Date.now() || pending.scopeKey !== buildScopeKey(scope)) {
      throw new ValidationError('AGENT_TOOL_APPROVAL_INVALID', '待确认工具已失效，请重新发起执行请求');
    }
    if (pending.plan.toolName !== approval.toolName) {
      throw new ValidationError('AGENT_TOOL_APPROVAL_INVALID', '待确认工具与原始计划不一致');
    }
    return buildApprovedPlan(pending.plan, approval);
  }

  async run(input: AgentRunRequest, options: { scope?: DynamicValue } = {}) {
    const plan = input.approval
      ? this.consumePendingApproval(input, options.scope)
      : await this.planner.createPlan(input, { scope: options.scope });
    if (plan.toolName === 'chat.respond') {
      const toolResults = [buildChatResult(plan)];
      const trace = this.traces.create({
        mode: 'agent',
        requestInput: input.input,
        requestedSkills: [],
        skillResults: toolResults,
        scope: options.scope,
      });

      return {
        plan,
        trace,
        toolResults,
        response: plan.toolInput.response || plan.summary,
        workflowDraft: null,
      };
    }

    const tool = this.skills.get(plan.toolName);
    if (!tool) {
      throw new ValidationError('AGENT_TOOL_UNKNOWN', `Planner 选择了未知工具：${plan.toolName}`);
    }
    if (tool.requiresApproval === true) {
      if (input.approval) {
        const toolResult = await this.skills.run(plan.toolName, buildToolInput(plan), { scope: options.scope });
        const toolResults = [toolResult];
        const trace = this.traces.create({
          mode: 'agent-approved',
          requestInput: input.input,
          requestedSkills: [plan.toolName],
          skillResults: toolResults,
          scope: options.scope,
        });
        return {
          plan,
          trace,
          toolResults,
          response: buildToolResponse(plan.toolName, toolResult),
          workflowDraft: null,
          approvalRequired: false,
          pendingApproval: null,
        };
      }

      if (plan.toolName === 'workflow.applyDraft') {
        const previewResult = await this.skills.run(plan.toolName, buildToolInput(plan), { scope: options.scope });
        if (previewResult?.output?.approvalRequired === true) {
          const pendingApproval = this.createPendingApproval(plan, options.scope);
          const toolResults = [previewResult];
          const trace = this.traces.create({
            mode: 'agent-approval-required',
            requestInput: input.input,
            requestedSkills: [plan.toolName],
            skillResults: toolResults,
            scope: options.scope,
          });
          return {
            plan,
            trace,
            toolResults,
            response: buildToolResponse(plan.toolName, previewResult),
            workflowDraft: null,
            approvalRequired: true,
            pendingApproval,
          };
        }

        const toolResults = [previewResult];
        const trace = this.traces.create({
          mode: 'agent',
          requestInput: input.input,
          requestedSkills: [plan.toolName],
          skillResults: toolResults,
          scope: options.scope,
        });
        return {
          plan,
          trace,
          toolResults,
          response: buildToolResponse(plan.toolName, previewResult),
          workflowDraft: null,
          approvalRequired: false,
          pendingApproval: null,
        };
      }

      if (plan.toolName === 'workflow.execute') {
        const suggestInputsResult = await this.skills.run('workflow.suggestInputs', buildToolInput(plan), {
          scope: options.scope,
        });
        const previewOutput = buildWorkflowExecutePreviewOutput(plan, suggestInputsResult);
        const previewPlan: AgentPlan = {
          ...plan,
          toolInput: {
            ...plan.toolInput,
            workflow: previewOutput.workflow,
            requiredInputs: previewOutput.requiredInputs,
            inputs: previewOutput.inputs,
          },
        };
        const pendingApproval = this.createPendingApproval(previewPlan, options.scope);
        const previewResult = { skillId: plan.toolName, output: previewOutput };
        const toolResults = [suggestInputsResult, previewResult];
        const trace = this.traces.create({
          mode: 'agent-approval-required',
          requestInput: input.input,
          requestedSkills: ['workflow.suggestInputs', plan.toolName],
          skillResults: toolResults,
          scope: options.scope,
        });
        return {
          plan,
          trace,
          toolResults,
          response: buildToolResponse(plan.toolName, previewResult),
          workflowDraft: null,
          approvalRequired: true,
          pendingApproval,
        };
      }

      const pendingApproval = this.createPendingApproval(plan, options.scope);
      const toolResults = [{ skillId: plan.toolName, output: { approvalRequired: true, pendingApproval } }];
      const trace = this.traces.create({
        mode: 'agent-approval-required',
        requestInput: input.input,
        requestedSkills: [plan.toolName],
        skillResults: toolResults,
        scope: options.scope,
      });
      return {
        plan,
        trace,
        toolResults,
        response: `工具 ${plan.toolName} 需要你确认后才会执行。`,
        workflowDraft: null,
        approvalRequired: true,
        pendingApproval,
      };
    }

    const toolResult = await this.skills.run(plan.toolName, buildToolInput(plan), { scope: options.scope });
    const toolResults = [toolResult];
    const trace = this.traces.create({
      mode: 'agent',
      requestInput: input.input,
      requestedSkills: [plan.toolName],
      skillResults: toolResults,
      scope: options.scope,
    });

    return {
      plan,
      trace,
      toolResults,
      response: buildToolResponse(plan.toolName, toolResult),
      workflowDraft: plan.toolName === 'workflow.createDraft' ? toolResult?.output : null,
      approvalRequired: false,
      pendingApproval: null,
    };
  }
}

export const agentRunner = new AgentRunner();
