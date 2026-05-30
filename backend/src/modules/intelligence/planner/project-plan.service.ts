import type { DynamicValue, PlainObject } from '../../types.ts';

export type ProjectTask = {
  id: string;
  title: string;
  description: string;
  roleHint: string;
  priority: 'high' | 'medium' | 'low';
};

export type ProjectPlan = {
  brief: string;
  intentTags: string[];
  tasks: ProjectTask[];
};

function cleanText(value: DynamicValue, maxLength = 12000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export class ProjectPlanService {
  createPlan(input: PlainObject = {}): ProjectPlan {
    const brief = cleanText(input.input || input.brief || input.request);
    const intentTags = this.inferIntentTags(brief);
    const tasks: ProjectTask[] = [
      {
        id: 'task_brief',
        title: '澄清生产目标',
        description: '提炼用户目标、输入素材、预期产物和需要确认的约束。',
        roleHint: 'project-manager',
        priority: 'high',
      },
      {
        id: 'task_strategy',
        title: '制定创意方向',
        description: '给出视觉、文案或工作流方向，避免过早进入单一节点方案。',
        roleHint: 'creative-director',
        priority: 'high',
      },
    ];

    if (intentTags.includes('workflow')) {
      tasks.push({
        id: 'task_workflow',
        title: '设计工作流草案',
        description: '根据目标产物规划节点链路、输入输出和执行风险。',
        roleHint: 'workflow-architect',
        priority: 'high',
      });
    }

    if (intentTags.includes('asset')) {
      tasks.push({
        id: 'task_assets',
        title: '规划素材产出',
        description: '拆分图片、视频、文案或参考素材的交付项。',
        roleHint: 'asset-producer',
        priority: 'medium',
      });
    }

    tasks.push({
      id: 'task_review',
      title: '评审与风险检查',
      description: '检查产物是否对应需求、节点选择是否过度假设、是否需要用户确认。',
      roleHint: 'quality-reviewer',
      priority: 'high',
    });

    return {
      brief,
      intentTags,
      tasks,
    };
  }

  private inferIntentTags(brief: string) {
    const tags = new Set<string>(['project']);
    if (hasAny(brief, ['工作流', '节点', '画布', '流程', '自动化'])) tags.add('workflow');
    if (hasAny(brief, ['图片', '图像', '主图', '分镜图', '海报', '视觉'])) tags.add('image');
    if (hasAny(brief, ['视频', '短片', '短视频', '镜头'])) tags.add('video');
    if (hasAny(brief, ['文案', '脚本', '标题', '卖点', '客服', '问答'])) tags.add('copy');
    if (hasAny(brief, ['素材', '资产', '产物', '交付', '包装'])) tags.add('asset');
    if (tags.has('image') || tags.has('video') || tags.has('copy')) tags.add('asset');
    if (!tags.has('workflow')) tags.add('workflow');
    return [...tags];
  }
}

export const projectPlanService = new ProjectPlanService();
