import { Button, FieldLabel, TextInput, ToggleSwitch } from '@/ui/FormPrimitives';
import { TextComposer } from '@/ui/TextComposer';
import { ArrowLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { downloadArchive } from '@/domains/workflow/lib/fileArchive';
import { SearchInput } from '@/ui/MenuPrimitives';
import { builtinSkills } from './builtinSkills';
import { useId, useState } from 'react';
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
  const editorId = useId();
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
    <div className="agent-skill-body menu-group">
      {skill ? (
        <div className="agent-skill-detail">
          <button type="button" className="agent-skill-back" onClick={closeDetail}>
            <ArrowLeft size={14} /> 返回列表
          </button>
          <h3>{skill.name}</h3>
          {skill.description && <p>{skill.description}</p>}
          <div className="agent-panel__skill-actions">
            <Button
              variant="secondary"
              small
              onClick={() => downloadArchive(skillArchive(skill), `${skillSlug(skill)}.zip`)}
            >
              导出
            </Button>
            {!builtinSkills.some(({ id }) => id === skill.id) && (
              <>
                <Button
                  variant="secondary"
                  small
                  onClick={() => {
                    setDraft(skill);
                    setDeleteId(undefined);
                  }}
                >
                  编辑
                </Button>
                <Button
                  variant="danger"
                  small
                  onClick={() => {
                    setDeleteId(skill.id);
                    setDraft(undefined);
                  }}
                >
                  删除
                </Button>
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
              <Button
                variant="danger"
                small
                onClick={() => {
                  onRemove(skill.id);
                  closeDetail();
                }}
              >
                确认删除
              </Button>
              <Button variant="secondary" small onClick={() => setDeleteId(undefined)}>
                取消
              </Button>
            </div>
          )}
          {draft?.id === skill.id && (
            <div className="agent-skill-edit">
              <div>
                <FieldLabel htmlFor={`${editorId}-name`}>名称</FieldLabel>
                <TextInput
                  id={`${editorId}-name`}
                  value={draft.name}
                  maxLength={100}
                  onChange={(name) => setDraft({ ...draft, name })}
                />
              </div>
              <div>
                <FieldLabel htmlFor={`${editorId}-description`}>描述</FieldLabel>
                <TextInput
                  id={`${editorId}-description`}
                  value={draft.description}
                  maxLength={500}
                  onChange={(description) => setDraft({ ...draft, description })}
                />
              </div>
              <div>
                <FieldLabel htmlFor={`${editorId}-instructions`}>正文</FieldLabel>
                <TextComposer
                  label="正文"
                  textareaProps={{
                    id: `${editorId}-instructions`,
                    rows: 5,
                    maxLength: 240000,
                    value: draft.instructions ?? '',
                    onChange: (event) => setDraft({ ...draft, instructions: event.target.value }),
                  }}
                />
              </div>
              <div className="agent-panel__skill-actions">
                <Button
                  small
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
                </Button>
                <Button variant="secondary" small onClick={() => setDraft(undefined)}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {skills.length > 4 && (
            <SearchInput
              className="agent-skill-search-row"
              icon={<MagnifyingGlass size={15} />}
              aria-label="搜索 Skills"
              placeholder="搜索 Skills"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
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
                  <ToggleSwitch
                    aria-label={`启用 ${item.name}`}
                    checked={enabled}
                    disabled={!enabled && selected.length >= 12}
                    onChange={(checked) => onToggle(item.id, checked)}
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
