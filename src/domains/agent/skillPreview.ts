import { strFromU8, strToU8, unzipSync } from 'fflate';
import { parse } from 'yaml';

export type SkillFile = { path: string; text?: string; bytes?: number[] };
export type PreviewSkill = {
  id: string;
  slug?: string;
  name: string;
  description: string;
  instructions?: string;
  metadata?: Record<string, unknown>;
  files?: SkillFile[];
};

const maxBytes = 2 * 1024 * 1024;

function safePath(path: string) {
  return (
    path.length <= 240 &&
    path.split('/').every((part) => part && part !== '..' && part !== '.' && !/[\\:\x00-\x1f]/.test(part))
  );
}

export async function readSkillPreview(file: File): Promise<PreviewSkill> {
  if (/\.md$/i.test(file.name) && file.size <= 256 * 1024) return parseSkill(await file.text(), file.name);
  if (!/\.zip$/i.test(file.name) || file.size > maxBytes) throw new Error('请选择 Markdown 或不超过 2 MB 的技能 ZIP。');
  let total = 0;
  let count = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: ({ name, originalSize }) => {
      if (name.endsWith('/')) return false;
      if (!safePath(name) || ++count > 48 || (total += originalSize) > maxBytes)
        throw new Error('技能包路径无效或文件过多。');
      return true;
    },
  });
  const paths = Object.keys(entries);
  const manifests = paths.filter((path) => /(^|\/)SKILL\.md$/.test(path));
  if (manifests.length !== 1) throw new Error('技能包需要包含一份 SKILL.md。');
  const manifest = manifests[0];
  const root = manifest.slice(0, -'SKILL.md'.length);
  const skill = parseSkill(strFromU8(entries[manifest]));
  skill.files = paths
    .filter((path) => path !== manifest && path.startsWith(root))
    .map((path) => {
      const relative = path.slice(root.length);
      return /\.(md|txt|json|ya?ml|csv|tsv|xml|html|css|[cm]?js|ts|py|sh|rb|ps1|sql)$/i.test(path)
        ? { path: relative, text: strFromU8(entries[path]) }
        : { path: relative, bytes: Array.from(entries[path]) };
    });
  return skill;
}

export function parseSkill(text: string, filename = 'SKILL.md'): PreviewSkill {
  const source = text.replace(/^\uFEFF/, '');
  const frontMatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  const instructions = source.slice(frontMatter?.[0].length ?? 0).trim();
  if (!instructions || instructions.length > 240000) throw new Error('技能正文为空或过长。');
  if (!frontMatter && /^---[ \t]*\r?\n/.test(source)) throw new Error('技能的 YAML 元数据缺少结束标记。');
  const metadata: unknown = frontMatter ? parse(frontMatter[1], { maxAliasCount: 0, schema: 'core' }) : {};
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error('技能元数据必须是 YAML 对象。');
  const fields = metadata as Record<string, unknown>;
  const name =
    (typeof fields.name === 'string' && fields.name.trim()) ||
    instructions.match(/^#\s+(.+)$/m)?.[1] ||
    filename.replace(/\.md$/i, '');
  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  return { id: crypto.randomUUID(), name, description, instructions, metadata: fields };
}

export function skillSlug(skill: PreviewSkill) {
  const name = (skill.slug || skill.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64)
    .replace(/^-|-$/g, '');
  return name || `skill-${skill.id.slice(0, 8)}`;
}

export function formatSkill(skill: PreviewSkill) {
  const fields = { ...skill.metadata, name: skillSlug(skill), description: skill.description || skill.name };
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n\n${skill.instructions || skill.description}\n`;
}

export function skillArchive(skill: PreviewSkill) {
  const root = skillSlug(skill);
  return Object.fromEntries([
    [`${root}/SKILL.md`, strToU8(formatSkill(skill))],
    ...(skill.files ?? []).map((file) => [
      `${root}/${file.path}`,
      file.text === undefined ? Uint8Array.from(file.bytes ?? []) : strToU8(file.text),
    ]),
  ]);
}

export function buildSkillCatalog(skills: PreviewSkill[], selected: string[], auto: boolean) {
  return skills
    .filter(({ id }) => auto || selected.includes(id))
    .slice(0, 48)
    .map((skill) => ({
      id: skill.id,
      name: skill.name.slice(0, 200),
      description: skill.description.slice(0, 1024),
      instructions: skill.instructions || skill.description || skill.name,
      pinned: selected.includes(skill.id),
      resources: (skill.files ?? [])
        .filter(({ path, text }) => /^(references|assets)\//.test(path) && text !== undefined)
        .slice(0, 16)
        .map(({ path, text }) => ({ path, text: text!.slice(0, 24000) })),
    }));
}
