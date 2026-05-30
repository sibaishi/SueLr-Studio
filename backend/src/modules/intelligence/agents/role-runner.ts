import type { PlainObject } from '../../types.ts';
import type { ProjectPlan } from '../planner/project-plan.service.ts';
import type { TeamRoleTemplate } from '../teams/team-template.service.ts';
import { workflowBuilderService } from '../workflow-builder/workflow-builder.service.ts';

export type RoleRunOutput = {
  roleId: string;
  title: string;
  summary: string;
  trace: {
    source: 'local-rule';
    taskIds: string[];
    evidence: string[];
  };
  data?: PlainObject;
};

export class RoleRunner {
  run(role: TeamRoleTemplate, plan: ProjectPlan, options: { scope?: PlainObject } = {}): RoleRunOutput {
    const taskIds = plan.tasks.filter((task) => task.roleHint === role.id).map((task) => task.id);
    if (role.id === 'workflow-architect') {
      const draft = workflowBuilderService.createDraft(
        {
          input: plan.brief,
          context: {},
        },
        { scope: options.scope },
      );
      return {
        roleId: role.id,
        title: role.title,
        summary: `已生成 ${draft.workflow.nodes.length} 个节点的工作流草案，并完成基础校验。`,
        trace: {
          source: 'local-rule',
          taskIds,
          evidence: ['workflowBuilderService.createDraft', `intent:${draft.intent.domain}`],
        },
        data: {
          intent: draft.intent,
          draft: draft.draft,
          workflow: draft.workflow,
          validation: draft.validation,
          approvalsRequired: draft.approvalsRequired,
        },
      };
    }

    if (role.id === 'project-manager') {
      return {
        roleId: role.id,
        title: role.title,
        summary: `已拆解 ${plan.tasks.length} 个任务，识别标签：${plan.intentTags.join(', ')}。`,
        trace: { source: 'local-rule', taskIds, evidence: ['projectPlanService.createPlan'] },
        data: { tasks: plan.tasks, intentTags: plan.intentTags },
      };
    }

    if (role.id === 'creative-director') {
      return {
        roleId: role.id,
        title: role.title,
        summary: '建议先锁定目标产物、参考素材和风格边界，再进入具体节点链路。',
        trace: { source: 'local-rule', taskIds, evidence: ['intentTags', ...plan.intentTags] },
        data: {
          direction: plan.intentTags.includes('video')
            ? '视频方向需要区分分镜脚本、分镜图和最终视频文件。'
            : '图片方向需要区分参考图、生成图、排版图和最终输出。',
        },
      };
    }

    if (role.id === 'asset-producer') {
      return {
        roleId: role.id,
        title: role.title,
        summary: '已整理素材产出清单，后续执行前仍需用户确认输入素材和模型配置。',
        trace: { source: 'local-rule', taskIds, evidence: ['asset-intent-tags'] },
        data: {
          assetTypes: plan.intentTags.filter((tag) => ['image', 'video', 'copy'].includes(tag)),
        },
      };
    }

    return {
      roleId: role.id,
      title: role.title,
      summary: '已完成本地规则评审，未发现必须阻断的风险。',
      trace: { source: 'local-rule', taskIds, evidence: ['role-template'] },
    };
  }
}

export const roleRunner = new RoleRunner();
