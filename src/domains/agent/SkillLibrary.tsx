import { ArrowLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { downloadArchive } from '@/domains/workflow/lib/fileArchive';
import { builtinSkills } from './builtinSkills';
import { useState } from 'react';
import { skillArchive, skillSlug, type PreviewSkill } from './skillPreview';

export default function SkillLibrary({
  skills,
  selected,
  onToggle,
  onSave,
  onRemove,
}: {
  skills: PreviewSkill[];
  selected: string[];
  onToggle: (id: string, enabled: boolean) => void;
  onSave: (skill: PreviewSkill) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<PreviewSkill>();
  const [previewId, setPreviewId] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const matches = skills.filter(({ name, description }) =>
    `${name} ${description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const skill = skills.find(({ id }) => id === previewId);
  const closeDetail = () => {
    setPreviewId(undefined);
    setDraft(undefined);
    setDeleteId(undefined);
  };

  return (
    <div className="agent-skill-body">
      {skill ? (
        <div className="agent-skill-detail">
          <button type="button" className="agent-skill-back" onClick={closeDetail}>
            <ArrowLeft size={14} /> 返回列表
          </button>
          <h3>{skill.name}</h3>
          {skill.description && <p>{skill.description}</p>}
          <div className="agent-panel__skill-actions">
            <button type="button" onClick={() => downloadArchive(skillArchive(skill), `${skillSlug(skill)}.zip`)}>
              导出
            </button>
            {!builtinSkills.some(({ id }) => id === skill.id) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(skill);
                    setDeleteId(undefined);
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteId(skill.id);
                    setDraft(undefined);
                  }}
                >
                  删除
                </button>
              </>
            )}
          </div>
          {!draft && (
            <>
              <pre tabIndex={0}>{skill.instructions || skill.description}</pre>
              {skill.files?.map((file) => (
                <details key={file.path}>
                  <summary>{file.path}</summary>
                  {file.text !== undefined ? <pre tabIndex={0}>{file.text}</pre> : <p>二进制附件，随技能包导出。</p>}
                </details>
              ))}
            </>
          )}
          {deleteId === skill.id && (
            <div className="agent-panel__skill-actions">
              <button
                type="button"
                onClick={() => {
                  onRemove(skill.id);
                  closeDetail();
                }}
              >
                确认删除
              </button>
              <button type="button" onClick={() => setDeleteId(undefined)}>
                取消
              </button>
            </div>
          )}
          {draft?.id === skill.id && (
            <div className="agent-skill-edit">
              <label>
                名称
                <input
                  value={draft.name}
                  maxLength={100}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label>
                描述
                <input
                  value={draft.description}
                  maxLength={500}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label>
                正文
                <textarea
                  rows={5}
                  maxLength={240000}
                  value={draft.instructions}
                  onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
                />
              </label>
              <div className="agent-panel__skill-actions">
                <button
                  type="button"
                  disabled={!draft.name.trim() || !draft.instructions?.trim()}
                  onClick={() => {
                    onSave({
                      ...draft,
                      name: draft.name.trim(),
                      description: draft.description.trim(),
                      instructions: draft.instructions?.trim(),
                    });
                    setDraft(undefined);
                  }}
                >
                  保存 Skill
                </button>
                <button type="button" onClick={() => setDraft(undefined)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {skills.length > 4 && (
            <label className="agent-skill-search-row">
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input
                aria-label="搜索 Skills"
                placeholder="搜索 Skills"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          {matches.length === 0 && <p className="agent-skill-empty">没有匹配的 Skill。</p>}
          <ul className="agent-skill-list">
            {matches.map((item) => {
              const enabled = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="agent-skill-name"
                    onClick={() => setPreviewId(item.id)}
                    aria-label={`查看 ${item.name}`}
                    title={item.description || item.name}
                  >
                    <span>{item.name}</span>
                    <CaretRight size={13} aria-hidden="true" />
                  </button>
                  <input
                    className="agent-skill-switch"
                    type="checkbox"
                    role="switch"
                    aria-label={`启用 ${item.name}`}
                    checked={enabled}
                    disabled={!enabled && selected.length >= 12}
                    onChange={(event) => onToggle(item.id, event.target.checked)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
