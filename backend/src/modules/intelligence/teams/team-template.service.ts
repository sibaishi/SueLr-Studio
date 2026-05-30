export type TeamRoleTemplate = {
  id: string;
  title: string;
  responsibility: string;
};

export type TeamTemplate = {
  id: string;
  title: string;
  description: string;
  roles: TeamRoleTemplate[];
  modes: Array<'serial' | 'parallel-draft' | 'review-rework'>;
};

const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'brand-visual',
    title: '品牌视觉团队',
    description: '用于品牌视觉方向、图片产物和视觉一致性评审。',
    modes: ['serial', 'review-rework'],
    roles: [
      { id: 'project-manager', title: '项目经理', responsibility: '拆解需求、确认交付项和约束。' },
      { id: 'creative-director', title: '创意总监', responsibility: '提出视觉方向和取舍依据。' },
      { id: 'workflow-architect', title: 'Workflow Architect', responsibility: '把方向转成可预览工作流草案。' },
      { id: 'quality-reviewer', title: '质检评审', responsibility: '检查一致性、风险和返工建议。' },
    ],
  },
  {
    id: 'workflow-engineering',
    title: '工作流工程团队',
    description: '用于工作流节点链路设计、执行风险检查和草案生成。',
    modes: ['serial', 'parallel-draft', 'review-rework'],
    roles: [
      { id: 'project-manager', title: '项目经理', responsibility: '把自然语言需求拆成可执行工作流目标。' },
      { id: 'workflow-architect', title: 'Workflow Architect', responsibility: '规划节点、连线、输入输出和验证点。' },
      { id: 'quality-reviewer', title: '质检评审', responsibility: '检查节点语义、执行前置条件和用户确认点。' },
    ],
  },
  {
    id: 'ecommerce-assets',
    title: '电商素材团队',
    description: '用于主图、详情页、社媒首发图和短视频方向的素材生产规划。',
    modes: ['serial', 'parallel-draft', 'review-rework'],
    roles: [
      { id: 'project-manager', title: '项目经理', responsibility: '拆解电商素材套件和优先级。' },
      { id: 'creative-director', title: '创意总监', responsibility: '制定卖点表达、风格和构图方向。' },
      { id: 'asset-producer', title: '素材制作', responsibility: '列出图片、视频、文案产物清单。' },
      { id: 'workflow-architect', title: 'Workflow Architect', responsibility: '生成素材生产工作流草案。' },
      { id: 'quality-reviewer', title: '质检评审', responsibility: '检查交付完整性和风险。' },
    ],
  },
];

export class TeamTemplateService {
  list() {
    return TEAM_TEMPLATES.map((template) => ({ ...template, roles: [...template.roles], modes: [...template.modes] }));
  }

  getById(id?: string) {
    const normalized = String(id || '').trim();
    return this.list().find((template) => template.id === normalized) || this.list()[0];
  }
}

export const teamTemplateService = new TeamTemplateService();
