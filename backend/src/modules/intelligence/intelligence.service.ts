import { ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue } from '../types.ts';
import type {
  AgentPlanRequest,
  AgentRunRequest,
  IntelligenceRunRequest,
  KnowledgeSearchRequest,
  KnowledgeWriteRequest,
  WorkflowDraftRequest,
} from './intelligence.schema.ts';
import { knowledgeService } from './knowledge/knowledge.service.ts';
import { agentPlannerService } from './planner/agent-planner.service.ts';
import { agentRunner } from './runtime/agent-runner.ts';
import { runTraceRepository } from './runtime/run-trace.ts';
import { skillRegistry } from './skills/skill-registry.ts';
import { workflowBuilderService } from './workflow-builder/workflow-builder.service.ts';

const DEFAULT_RUN_SKILLS = ['knowledge.search', 'workflow.list', 'model.list'];

export class IntelligenceService {
  listSkills() {
    return skillRegistry.list();
  }

  listKnowledge(options: { scope?: DynamicValue } = {}) {
    return knowledgeService.listKnowledgeSources(options.scope);
  }

  searchKnowledge(input: KnowledgeSearchRequest, options: { scope?: DynamicValue } = {}) {
    return knowledgeService.search(input, { scope: options.scope });
  }

  writeKnowledge(input: KnowledgeWriteRequest, options: { scope?: DynamicValue } = {}) {
    return knowledgeService.write(input, { scope: options.scope });
  }

  importLegacyMemory(options: { scope?: DynamicValue } = {}) {
    return knowledgeService.importLegacyMemory({ scope: options.scope });
  }

  rebuildSeedKnowledge(options: { scope?: DynamicValue } = {}) {
    return knowledgeService.rebuildSeedKnowledge({ scope: options.scope });
  }

  getRun(id: string, options: { scope?: DynamicValue } = {}) {
    return runTraceRepository.read(id, options.scope);
  }

  async createAgentPlan(input: AgentPlanRequest, options: { scope?: DynamicValue } = {}) {
    return agentPlannerService.createPlan(input, { scope: options.scope });
  }

  async createAgentRun(input: AgentRunRequest, options: { scope?: DynamicValue } = {}) {
    return agentRunner.run(input, { scope: options.scope });
  }

  async createRun(input: IntelligenceRunRequest, options: { scope?: DynamicValue } = {}) {
    const requestedSkills = input.skills.length > 0 ? input.skills : DEFAULT_RUN_SKILLS;
    const skillResults = [];

    for (const skillId of requestedSkills) {
      const result = await skillRegistry.run(skillId, this.buildSkillInput(skillId, input), { scope: options.scope });
      if (!result) {
        throw new ValidationError('INTELLIGENCE_SKILL_UNKNOWN', `未知 Skill: ${skillId}`);
      }
      skillResults.push(result);
    }

    return runTraceRepository.create({
      mode: input.mode,
      requestInput: input.input,
      requestedSkills,
      skillResults,
      scope: options.scope,
    });
  }

  async createWorkflowDraft(input: WorkflowDraftRequest, options: { scope?: DynamicValue } = {}) {
    return workflowBuilderService.createDraft(input, options);
  }

  private buildSkillInput(skillId: string, input: IntelligenceRunRequest) {
    const context = input.context || {};
    if (skillId === 'knowledge.search') {
      return { query: input.input };
    }
    if (['brief.parse', 'workflow.createDraft'].includes(skillId)) {
      return { input: input.input };
    }
    if (skillId === 'team.run') {
      return {
        input: input.input,
        teamId: typeof context.teamId === 'string' ? context.teamId : '',
      };
    }
    if (skillId === 'workflow.inspect') {
      return {
        workflowId: String(context.workflowId || ''),
        workflowName: typeof context.workflowName === 'string' ? context.workflowName : '',
        workflowSnapshot:
          context.workflowSnapshot &&
          typeof context.workflowSnapshot === 'object' &&
          !Array.isArray(context.workflowSnapshot)
            ? context.workflowSnapshot
            : undefined,
      };
    }
    if (skillId === 'workflow.edit') {
      return {
        input: input.input,
        workflowId: typeof context.workflowId === 'string' ? context.workflowId : '',
        workflowName: typeof context.workflowName === 'string' ? context.workflowName : '',
        workflowSnapshot:
          context.workflowSnapshot &&
          typeof context.workflowSnapshot === 'object' &&
          !Array.isArray(context.workflowSnapshot)
            ? context.workflowSnapshot
            : undefined,
      };
    }
    if (skillId === 'workflow.applyDraft') {
      return {
        workflowId: typeof context.workflowId === 'string' ? context.workflowId : '',
        workflowName: typeof context.workflowName === 'string' ? context.workflowName : '',
        workflowSnapshot:
          context.workflowSnapshot &&
          typeof context.workflowSnapshot === 'object' &&
          !Array.isArray(context.workflowSnapshot)
            ? context.workflowSnapshot
            : undefined,
        workflowEditPatch:
          context.workflowEditPatch &&
          typeof context.workflowEditPatch === 'object' &&
          !Array.isArray(context.workflowEditPatch)
            ? context.workflowEditPatch
            : undefined,
        confirmed: context.confirmed === true,
      };
    }
    if (['workflow.suggestInputs', 'workflow.execute'].includes(skillId)) {
      return {
        workflowId: typeof context.workflowId === 'string' ? context.workflowId : '',
        workflowName: typeof context.workflowName === 'string' ? context.workflowName : '',
        workflowSnapshot:
          context.workflowSnapshot &&
          typeof context.workflowSnapshot === 'object' &&
          !Array.isArray(context.workflowSnapshot)
            ? context.workflowSnapshot
            : undefined,
        inputs:
          context.inputs && typeof context.inputs === 'object' && !Array.isArray(context.inputs) ? context.inputs : {},
        confirmed: context.confirmed === true,
      };
    }
    if (['workflow.diagnose', 'workflow.summarizeRun', 'knowledge.summarizeRun'].includes(skillId)) {
      return { runId: String(context.runId || '') };
    }
    return {};
  }
}

export const intelligenceService = new IntelligenceService();
