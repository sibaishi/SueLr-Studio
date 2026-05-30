import { ValidationError } from '../../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { AgentRunRequest } from '../intelligence.schema.ts';
import { agentPlannerService, type AgentPlan } from '../planner/agent-planner.service.ts';
import { runTraceRepository } from './run-trace.ts';
import { skillRegistry } from '../skills/skill-registry.ts';

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

export class AgentRunner {
  planner: AgentPlannerLike;
  skills: SkillRegistryLike;
  traces: RunTraceRepositoryLike;

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

  async run(input: AgentRunRequest, options: { scope?: DynamicValue } = {}) {
    const plan = await this.planner.createPlan(input, { scope: options.scope });
    const tool = this.skills.get(plan.toolName);
    if (!tool) {
      throw new ValidationError('AGENT_TOOL_UNKNOWN', `Planner 选择了未知工具：${plan.toolName}`);
    }
    if (tool.requiresApproval === true) {
      throw new ValidationError('AGENT_TOOL_APPROVAL_REQUIRED', `工具 ${plan.toolName} 需要用户确认后才能执行`);
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
      workflowDraft: plan.toolName === 'workflow.createDraft' ? toolResult?.output : null,
    };
  }
}

export const agentRunner = new AgentRunner();
