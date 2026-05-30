import type { RoleRunOutput } from '../agents/role-runner.ts';
import type { ProjectPlan } from '../planner/project-plan.service.ts';

export type TeamReview = {
  score: number;
  verdict: 'pass' | 'needs-confirmation' | 'needs-rework';
  summary: string;
  suggestions: string[];
};

export class ReviewService {
  review(plan: ProjectPlan, roleOutputs: RoleRunOutput[]): TeamReview {
    const hasWorkflowDraft = roleOutputs.some(
      (output) => output.roleId === 'workflow-architect' && output.data?.workflow,
    );
    const suggestions: string[] = [];
    if (!plan.brief) suggestions.push('需求为空，无法继续拆解。');
    if (!hasWorkflowDraft) suggestions.push('当前团队输出不包含工作流草案。');
    if (plan.intentTags.includes('video'))
      suggestions.push('视频任务执行前需要确认最终产物是视频文件还是分镜/脚本文本。');

    const score = Math.max(60, 92 - suggestions.length * 8);
    return {
      score,
      verdict: suggestions.length > 1 ? 'needs-rework' : 'needs-confirmation',
      summary: suggestions.length > 0 ? '团队已产出初稿，但执行前仍有确认项。' : '团队初稿完整，可进入用户确认。',
      suggestions,
    };
  }
}

export const reviewService = new ReviewService();
