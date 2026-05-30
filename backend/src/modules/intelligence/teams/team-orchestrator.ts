import type { DynamicValue, PlainObject } from '../../types.ts';
import { roleRunner } from '../agents/role-runner.ts';
import { projectPlanService } from '../planner/project-plan.service.ts';
import { reviewService } from '../review/review.service.ts';
import { teamTemplateService } from './team-template.service.ts';

export class TeamOrchestrator {
  listTemplates() {
    return {
      teams: teamTemplateService.list(),
    };
  }

  run(input: PlainObject = {}, options: { scope?: DynamicValue } = {}) {
    const team = teamTemplateService.getById(String(input.teamId || ''));
    const plan = projectPlanService.createPlan(input);
    const roleOutputs = team.roles.map((role) => roleRunner.run(role, plan, { scope: options.scope }));
    const review = reviewService.review(plan, roleOutputs);
    const workflowArchitectOutput = roleOutputs.find((output) => output.roleId === 'workflow-architect');

    return {
      team,
      plan,
      roleOutputs,
      review,
      workflowDraft: workflowArchitectOutput?.data || null,
      trace: roleOutputs.map((output) => ({
        roleId: output.roleId,
        title: output.title,
        ...output.trace,
      })),
      approvalsRequired: ['applyDraft', 'executeWorkflow'],
    };
  }
}

export const teamOrchestrator = new TeamOrchestrator();
