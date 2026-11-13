import { z } from 'zod';

export const skillCatalogSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(200),
        description: z.string().max(1024),
        instructions: z.string().min(1).max(240000),
        pinned: z.boolean(),
        resources: z
          .array(
            z
              .object({
                path: z
                  .string()
                  .max(240)
                  .regex(/^(references|assets)\//),
                text: z.string().max(24000),
              })
              .strict(),
          )
          .max(16),
      })
      .strict(),
  )
  .max(48)
  .refine(
    (skills) =>
      new Set(skills.map(({ id }) => id)).size === skills.length &&
      skills.reduce(
        (size, skill) =>
          size +
          skill.instructions.length +
          skill.resources.reduce((total, resource) => total + resource.text.length, 0),
        0,
      ) <= 1_000_000,
    '技能资料过多或技能标识重复。',
  );

type Skill = z.infer<typeof skillCatalogSchema>[number];
export function describeSkills(skills: Skill[]) {
  return JSON.stringify(skills.map(({ id, name, description, pinned }) => ({ id, name, description, pinned })));
}

export function buildSkillTools(skills: Skill[]) {
  const loaded = new Set(skills.filter(({ pinned }) => pinned).map(({ id }) => id));
  const tools = [
    {
      type: 'function',
      function: {
        name: 'load_skill',
        description: '按当前任务加载匹配的技能正文。通常只加载最相关的技能。',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_skill_resource',
        description: '从已加载的技能读取参考资料或文本模板。路径必须在技能正文返回的资源清单内。',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' }, path: { type: 'string' } },
          required: ['id', 'path'],
          additionalProperties: false,
        },
      },
    },
  ];

  const describe = (skill: Skill) => ({
    name: skill.name,
    instructions: skill.instructions,
    resources: skill.resources.map(({ path }) => path),
  });

  function execute(name: string, args: unknown) {
    const parsed = z.object({ id: z.string(), path: z.string().optional() }).strict().safeParse(args);
    if (!parsed.success) return { error: '参数无效。' };
    const skill = skills.find(({ id }) => id === parsed.data.id);
    if (!skill) return { error: '技能不存在。' };
    if (name === 'load_skill') {
      loaded.add(skill.id);
      return describe(skill);
    }
    const file = skill.resources.find(({ path }) => path === parsed.data.path);
    if (!loaded.has(skill.id) || !file) return { error: '请先加载技能，并选择其列出的资源。' };
    return file;
  }

  return { tools, execute, loaded, pinned: skills.filter(({ pinned }) => pinned).map(describe) };
}
