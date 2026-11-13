export type PreviewSkill = {
  id: string;
  name: string;
  description: string;
  instructions?: string;
};

export async function readSkillPreview(file: File): Promise<PreviewSkill> {
  if (!/\.md$/i.test(file.name) || file.size > 256 * 1024) {
    throw new Error('请选择不超过 256 KB 的 Markdown 技能文件。');
  }
  return parseSkill(await file.text(), file.name);
}

export function parseSkill(text: string, filename = 'SKILL.md'): PreviewSkill {
  const source = text.replace(/^\uFEFF/, '');
  const frontMatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  const instructions = source.slice(frontMatter?.[0].length ?? 0).trim();
  if (!instructions) throw new Error('技能文件缺少正文。');

  function readField(field: string) {
    const value = frontMatter?.[1].match(new RegExp(`^${field}:[ \\t]*(.+)$`, 'm'))?.[1].trim();
    return value && !/^[>|][+-]?$/.test(value) ? value.replace(/^(['"])(.*)\1$/, '$2').trim() : '';
  }

  const name = readField('name') || instructions.match(/^#\s+(.+)$/m)?.[1] || filename.replace(/\.md$/i, '');
  return { id: crypto.randomUUID(), name, description: readField('description'), instructions };
}
