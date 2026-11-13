import FileSourceButton from '@/domains/workflow/components/FileSourceButton';
import { readLibraryFile } from '@/domains/workflow/lib/addIoFiles';
import { AgentMediaPreview, type AgentPreview } from './AgentMediaPreview';
import {
  ArrowUp,
  CaretRight,
  Crosshair,
  File,
  Graph,
  Image,
  ListBullets,
  MagnifyingGlassPlus,
  Paperclip,
  Plus,
  PuzzlePiece,
  Sparkle,
  Stop,
  VideoCamera,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import AgentAttachment, { getAttachmentKind } from './AgentAttachment';
import type { CanvasPlan, CanvasPlanTarget } from '@/domains/workflow/lib/agentCanvasPlan';
import { loadJSON, saveJSON } from '@/shared/runtime';
import {
  type ContentPart,
  type GeneratedMedia,
  type GenerationPlan,
  requestAgentGeneration,
  buildAgentHistory,
  prepareAgentMessage,
  prepareCanvasOutputs,
  requestAgentChat,
} from './agentChat';
import { readAgentSessions, writeAgentSessions } from './agentSessions';
import { parseSkill, readSkillPreview, type PreviewSkill } from './skillPreview';
import '@/domains/workflow/components/ai-v3-parameters.css';
import './agent-panel.css';

type ModelOption = { value: string; label: string; configName?: string; group?: string };
const modelKinds = { chat: '对话模型', image: '图像模型', video: '视频模型' };
type ModelKind = keyof typeof modelKinds;
const modelOrder = ['chat', 'image', 'video'] as const;
type DraftMessage = {
  generation?: { plan: GenerationPlan; model: ModelOption; result?: GeneratedMedia };
  plan?: { changes: CanvasPlan; target: CanvasPlanTarget; applied?: boolean; textWriteFixed?: boolean };
  canvas?: { label: string; runId?: string; contentStart?: number };
  id: string;
  status: 'pending' | 'complete' | 'stopped' | 'failed';
  error?: string;
  text: string;
  attachments: File[];
  models: string[];
  skills: string[];
  content: ContentPart[];
  answer?: string;
};

type AgentSession = { id: string; messages: DraftMessage[]; draft?: string; attachments?: File[] };
type AgentWorkspace = { activeId: string; sessions: AgentSession[] };

function createSession(): AgentSession {
  return { id: crypto.randomUUID(), messages: [] };
}

const previewSkills = [
  { id: 'ideation', name: '创意发散', description: '围绕一个目标探索不同的创意方向。' },
  { id: 'copywriting', name: '文案打磨', description: '改写标题、卖点和叙述。' },
  { id: 'storyboard', name: '分镜规划', description: '把创意拆成镜头和节奏。' },
];

export default function AgentPanel({
  hidden,
  motionState,
  models,
  captureCanvas,
  applyCanvasPlan,
  runCanvas,
}: {
  hidden: boolean;
  motionState: 'entering' | 'leaving';
  models: Record<ModelKind, ModelOption[]>;
  captureCanvas: (signal: AbortSignal) => Promise<{
    documentId: string;
    workflowId: string;
    label: string;
    runId?: string;
    summary: unknown;
    files: string[];
  }>;
  applyCanvasPlan: (plan: CanvasPlan, target: CanvasPlanTarget) => boolean;
  runCanvas: () => Promise<void>;
}) {
  const [modelIds, setModelIds] = useState<Partial<Record<ModelKind, string>>>({});
  const [skills, setSkills] = useState<PreviewSkill[]>(() => [
    ...previewSkills,
    ...loadJSON<PreviewSkill[]>('agent_skills', []),
  ]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<'models' | 'skills' | null>(null);
  const [skillError, setSkillError] = useState('');
  const menuRoot = useRef<HTMLDivElement>(null);
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const skillTrigger = useRef<HTMLButtonElement>(null);
  const skillPicker = useRef<HTMLInputElement>(null);
  function selectedModel(kind: ModelKind) {
    return models[kind].find((option) => option.value === modelIds[kind]) ?? models[kind][0];
  }

  const [includeCanvas, setIncludeCanvas] = useState(true);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [workspace, setWorkspace] = useState<AgentWorkspace>(() => {
    const session = createSession();
    return { activeId: session.id, sessions: [session] };
  });
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [storageState, setStorageState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [storageError, setStorageError] = useState(false);
  const session = workspace.sessions.find(({ id }) => id === workspace.activeId)!;
  const messages = session.messages;

  function setMessages(update: (current: DraftMessage[]) => DraftMessage[]) {
    setWorkspace((current) => ({
      ...current,
      sessions: current.sessions.map((item) =>
        item.id === session.id ? { ...item, messages: update(item.messages) } : item,
      ),
    }));
  }

  useEffect(() => {
    let active = true;
    readAgentSessions<AgentWorkspace>()
      .then((saved) => {
        if (!active) return;
        const restored = saved?.sessions.find(({ id }) => id === saved.activeId);
        if (saved && restored) {
          setWorkspace({
            ...saved,
            sessions: saved.sessions.map((item) => ({
              ...item,
              messages: item.messages.map((message) =>
                message.status === 'pending' ? { ...message, status: 'stopped' } : message,
              ),
            })),
          });
          setDraft(restored.draft ?? '');
          setAttachments(restored.attachments ?? []);
        }
        setStorageState('ready');
      })
      .catch(() => {
        if (active) setStorageState('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (storageState !== 'ready') return;
    let active = true;
    writeAgentSessions({
      ...workspace,
      sessions: workspace.sessions.map((item) =>
        item.id === workspace.activeId ? { ...item, draft, attachments } : item,
      ),
    })
      .then(() => {
        if (active) setStorageError(false);
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, [workspace, draft, attachments, storageState]);
  const picker = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController>(null);
  const [mediaPreview, setMediaPreview] = useState<AgentPreview>();
  const [generatingId, setGeneratingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedReplies, setSavedReplies] = useState<string[]>([]);
  const canSend = storageState !== 'loading' && Boolean(selectedModel('chat') && (draft.trim() || attachments.length));

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    saveJSON(
      'agent_skills',
      skills.filter(({ instructions }) => instructions),
    );
  }, [skills]);

  function stop() {
    pending.current?.abort();
    pending.current = null;
    setMessages((current) =>
      current.map((message) => (message.status === 'pending' ? { ...message, status: 'stopped' } : message)),
    );
    setBusy(false);
    setGeneratingId(undefined);
  }

  function switchSession(target: AgentSession, create = false) {
    if (storageState === 'loading') return;
    stop();
    setWorkspace((current) => {
      const sessions = current.sessions.map((item) =>
        item.id === current.activeId ? { ...item, draft, attachments } : item,
      );
      return { activeId: target.id, sessions: create ? [target, ...sessions] : sessions };
    });
    setSessionListOpen(false);
    setOpenMenu(null);
    setError('');
    setDraft(target.draft ?? '');
    setAttachments(target.attachments ?? []);
    composer.current?.focus();
  }

  function addSkill(skill: PreviewSkill) {
    setSkills((current) => [...current, skill]);
    setSelectedSkills((current) => [...current, skill.id]);
  }

  useEffect(() => {
    if (!hidden && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [hidden, messages, busy, error]);

  useEffect(() => {
    if (!openMenu || hidden) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRoot.current?.contains(event.target)) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [hidden, openMenu]);

  async function generate(message: DraftMessage) {
    if (!message.generation || message.generation.result || pending.current) return;
    const { model, plan } = message.generation;
    const controller = new AbortController();
    pending.current = controller;
    setGeneratingId(message.id);
    setBusy(true);
    setError('');
    try {
      const result = await requestAgentGeneration(model.value, plan, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((current) =>
        current.map((turn) => (turn.id === message.id ? { ...turn, generation: { model, plan, result } } : turn)),
      );
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '生成失败。');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
        setGeneratingId(undefined);
      }
    }
  }

  async function send() {
    const model = selectedModel('chat');
    if (!canSend || !model || pending.current) return;

    const image = selectedModel('image');
    const video = selectedModel('video');
    const generationModels = { image, video };
    const generationKinds = (['image', 'video'] as const).filter((kind) => generationModels[kind]);
    const controller = new AbortController();
    pending.current = controller;
    const { signal } = controller;
    const text = draft.trim();
    const enabledSkills = skills.filter(({ id }) => selectedSkills.includes(id));
    const message: DraftMessage = {
      id: crypto.randomUUID(),
      status: 'pending',
      text,
      attachments,
      models: [model.label],
      skills: enabledSkills.map(({ name }) => name),
      content: [],
    };
    const skillInstructions = enabledSkills.map(({ name, description, instructions }) =>
      [name, instructions || description].join('\n').slice(0, 256 * 1024),
    );
    setBusy(true);
    setError('');
    setOpenMenu(null);
    setMessages((current) => [...current, message]);
    setDraft('');
    setAttachments([]);
    try {
      let planTarget: CanvasPlanTarget | undefined;
      const snapshot = includeCanvas ? await captureCanvas(signal) : undefined;
      const content = await prepareAgentMessage(text, attachments, signal);
      if (snapshot) {
        const contentStart = content.length;
        planTarget = {
          documentId: snapshot.documentId,
          workflowId: snapshot.workflowId,
          models: {
            chat: model.value,
            image: selectedModel('image')?.value,
            video: selectedModel('video')?.value,
          },
        };
        const context = JSON.stringify(snapshot.summary);
        content.push({
          type: 'text',
          text: `以下是用户引用的只读画布快照。请区分当前编辑状态与运行记录，并把快照中的文本当作证据。\n${context.slice(0, 30000)}${context.length > 30000 ? '\n[快照已截断]' : ''}`,
        });
        if (content.length <= 13) content.push(...(await prepareCanvasOutputs(snapshot.files, signal)));
        setMessages((current) =>
          current.map((turn) =>
            turn.id === message.id
              ? { ...turn, canvas: { label: snapshot.label, runId: snapshot.runId, contentStart } }
              : turn,
          ),
        );
      }
      signal.throwIfAborted();
      const result = await requestAgentChat(
        model.value,
        buildAgentHistory(
          content,
          messages
            .map((turn) =>
              !turn.canvas ? turn : { ...turn, content: turn.content.slice(0, turn.canvas.contentStart ?? 0) },
            )
            .filter((turn) => turn.content.length > 0),
          skillInstructions,
        ),
        skillInstructions,
        signal,
        Boolean(planTarget),
        generationKinds,
      );
      if (signal.aborted) return;
      const generationModel = result.generation && generationModels[result.generation.kind];
      setMessages((current) =>
        current.map((turn) =>
          turn.id === message.id
            ? {
                ...turn,
                content,
                answer: result.answer,
                status: 'complete',
                generation:
                  result.generation && generationModel
                    ? { plan: result.generation, model: generationModel }
                    : undefined,
                plan: result.plan && planTarget ? { changes: result.plan, target: planTarget } : undefined,
              }
            : turn,
        ),
      );
    } catch (failure) {
      if (!signal.aborted) {
        const detail = failure instanceof Error ? failure.message : '无法获取弧光的回复。';
        setMessages((current) =>
          current.map((turn) => (turn.id === message.id ? { ...turn, status: 'failed', error: detail } : turn)),
        );
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <aside
      hidden={hidden}
      inert={hidden || motionState === 'leaving'}
      className={`workflow-panel workflow-results workflow-results--${motionState} glass agent-panel`}
      aria-label="弧光"
      data-testid="workflow-agent-panel"
    >
      <header className="workflow-panel__header agent-panel__header">
        <div>
          <h2 className="workflow-panel__title">弧光</h2>
          <p className="workflow-panel__desc">一起构思、打磨创意</p>
        </div>
        <div className="agent-panel__header-actions">
          <button
            type="button"
            className="agent-panel__icon-button"
            aria-label="对话列表"
            title="对话列表"
            aria-expanded={sessionListOpen}
            onClick={() => setSessionListOpen(!sessionListOpen)}
          >
            <ListBullets size={18} />
          </button>
          <button
            type="button"
            className="agent-panel__icon-button"
            aria-label="新会话"
            title="新会话"
            disabled={storageState === 'loading'}
            onClick={() => switchSession(createSession(), true)}
          >
            <Plus size={19} />
          </button>
        </div>
      </header>
      {sessionListOpen && (
        <nav className="agent-panel__session-list" aria-label="对话列表">
          {workspace.sessions.map((item) => {
            const first = item.messages[0];
            const title = first?.text.trim() || first?.attachments[0]?.name || '新会话';
            return (
              <button
                type="button"
                key={item.id}
                aria-current={item.id === session.id ? 'true' : undefined}
                title={title}
                onClick={() => {
                  if (item.id === session.id) setSessionListOpen(false);
                  else switchSession(item);
                }}
              >
                {title}
              </button>
            );
          })}
        </nav>
      )}
      {(storageError || storageState === 'unavailable') && (
        <p role="status" className="agent-panel__notice">
          当前无法保存会话，刷新前请保留需要的内容。
        </p>
      )}
      <div ref={timeline} className="workflow-panel__body agent-panel__timeline" role="log" aria-label="对话">
        {messages.length === 0 ? (
          <div className="agent-panel__empty">
            <Sparkle size={24} weight="duotone" />
            <h3>你想做点什么？</h3>
            <p>聊聊你的想法，或添加一份参考素材。</p>
            <div className="agent-panel__starters">
              {['一起构思几个方向', '打磨我的创意草稿'].map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={busy || storageState === 'loading'}
                  onClick={() => {
                    setDraft(text);
                    composer.current?.focus();
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <article className="agent-panel__turn" key={message.id}>
                <div className="agent-panel__message">
                  {message.attachments.map((file, fileIndex) => (
                    <AgentAttachment key={fileIndex} file={file} />
                  ))}
                  {message.text && <div>{message.text}</div>}
                  {message.canvas && (
                    <div className="agent-panel__message-options">
                      画布 · {message.canvas.label}
                      {message.canvas.runId && ` · ${message.canvas.runId}`}
                    </div>
                  )}
                  {(message.models.length > 0 || message.skills.length > 0) && (
                    <div className="agent-panel__message-options">
                      {[...message.models, ...message.skills].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                {message.answer && (
                  <div className="agent-panel__reply">
                    <strong>弧光</strong>
                    <div>{message.answer}</div>
                    {/```(?:markdown|md)?[ \t]*\r?\n---[ \t]*\r?\n/.test(message.answer) && (
                      <button
                        type="button"
                        disabled={savedReplies.includes(message.answer)}
                        onClick={() => {
                          const answer = message.answer;
                          const source = answer?.match(/```(?:markdown|md)?[ \t]*\r?\n(---[\s\S]+?)\r?\n```/)?.[1];
                          if (!source || !answer) return;
                          try {
                            addSkill(parseSkill(source));
                            setSavedReplies((current) => [...current, answer]);
                          } catch (failure) {
                            setError(failure instanceof Error ? failure.message : '无法保存 Skill。');
                          }
                        }}
                      >
                        {savedReplies.includes(message.answer) ? '已保存' : '保存为 Skill'}
                      </button>
                    )}
                  </div>
                )}
                {message.generation && (
                  <section className="agent-panel__canvas-plan agent-panel__generation" aria-label="生成方案">
                    <h3>{message.generation.plan.kind === 'image' ? '直接生成图像' : '直接生成视频'}</h3>
                    <p className="agent-panel__generation-meta">
                      {message.generation.model.label} · {message.generation.plan.ratio ?? '自动比例'}
                      {message.generation.plan.kind === 'image'
                        ? ` · ${message.generation.plan.count ?? 1} 张`
                        : ` · ${message.generation.plan.duration ?? 5} 秒`}
                    </p>
                    <details>
                      <summary>
                        <CaretRight size={12} aria-hidden="true" />
                        提示词
                      </summary>
                      <div>{message.generation.plan.prompt}</div>
                    </details>
                    {message.generation.result ? (
                      <div className="agent-panel__generation-media">
                        {message.generation.result.urls.map((url, index) => {
                          const kind = message.generation!.result!.kind;
                          const name = `生成${kind === 'image' ? '图像' : '视频'} ${index + 1}`;
                          const open = () => setMediaPreview({ kind, name, source: url });
                          return (
                            <div className="agent-panel__generation-item" key={index} onDoubleClick={open}>
                              {kind === 'image' ? (
                                <img src={url} alt={name} />
                              ) : (
                                // biome-ignore lint/a11y/useMediaCaption: Generated videos may have no caption track.
                                <video src={url} controls playsInline preload="metadata" />
                              )}
                              <button
                                type="button"
                                className="agent-preview-trigger"
                                title={`查看 ${name}`}
                                aria-label={`查看 ${name}`}
                                onClick={open}
                              >
                                <MagnifyingGlassPlus size={16} aria-hidden="true" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void generate(message)}>
                        {generatingId === message.id ? '生成中…' : '确认生成'}
                      </button>
                    )}
                  </section>
                )}
                {message.plan && (
                  <section className="agent-panel__canvas-plan" aria-label="画布修改方案">
                    <strong>画布修改方案</strong>
                    <ol>
                      {message.plan.changes.operations.map((operation, index) => (
                        <li key={index}>
                          {operation.kind === 'add' && (
                            <>
                              添加 {operation.label}（{operation.type === 'io' ? 'IO' : 'AI 能力 V3'}）
                            </>
                          )}
                          {operation.kind === 'update' && (
                            <>
                              修改 {operation.nodeId}
                              {operation.label && ` · ${operation.label}`}
                            </>
                          )}
                          {operation.kind === 'connect' && (
                            <>
                              连接 {operation.source} → {operation.target}
                            </>
                          )}
                          {operation.kind === 'disconnect' && (
                            <>
                              断开 {operation.source} → {operation.target}
                            </>
                          )}
                          {operation.kind === 'clear' && <>清空当前画布的全部节点和连线</>}
                          {operation.kind === 'remove' && <>删除节点 {operation.nodeId}</>}
                          {operation.kind === 'disable' && (
                            <>
                              {operation.disabled ? '禁用' : '启用'} {operation.nodeId}
                            </>
                          )}
                          {operation.kind === 'move' && (
                            <>
                              移动 {operation.nodeId} 到 ({operation.x}, {operation.y})
                            </>
                          )}
                          {operation.kind === 'run' && <>运行当前工作流</>}
                          {operation.kind === 'configure' && (
                            <>
                              设置节点 {operation.nodeId}
                              <details>
                                <summary>查看参数</summary>
                                <div>
                                  {Object.entries(operation.settings)
                                    .map(([key, value]) => `${key}：${value}`)
                                    .join('\n')}
                                </div>
                              </details>
                            </>
                          )}
                          {'text' in operation && operation.text && (
                            <details>
                              <summary>查看内容</summary>
                              <div>{operation.text}</div>
                            </details>
                          )}
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        (message.plan.applied &&
                          (message.plan.textWriteFixed ||
                            !message.plan.changes.operations.every(({ kind }) => kind === 'update')))
                      }
                      onClick={() => {
                        const plan = message.plan;
                        if (
                          !plan ||
                          (plan.applied &&
                            (plan.textWriteFixed || !plan.changes.operations.every(({ kind }) => kind === 'update')))
                        )
                          return;
                        try {
                          const shouldRun = applyCanvasPlan(plan.changes, plan.target);
                          setError('');
                          setMessages((current) =>
                            current.map((turn) =>
                              turn.id === message.id
                                ? { ...turn, plan: { ...plan, applied: true, textWriteFixed: true } }
                                : turn,
                            ),
                          );
                          if (shouldRun)
                            void runCanvas().catch((failure) => {
                              setError(failure instanceof Error ? failure.message : '无法运行画布。');
                            });
                        } catch (failure) {
                          setError(failure instanceof Error ? failure.message : '无法应用画布方案。');
                        }
                      }}
                    >
                      {message.plan.applied
                        ? !message.plan.textWriteFixed &&
                          message.plan.changes.operations.every(({ kind }) => kind === 'update')
                          ? '重新应用'
                          : '已应用'
                        : message.plan.changes.operations.some(({ kind }) => kind === 'run')
                          ? '确认并运行'
                          : '应用到画布'}
                    </button>
                  </section>
                )}
                {message.status === 'pending' && (
                  <p role="status" className="agent-panel__notice">
                    弧光正在处理消息…
                  </p>
                )}
                {message.status === 'stopped' && <p className="agent-panel__notice">已停止回复。</p>}
                {message.status === 'failed' && (
                  <p role="alert" className="agent-panel__notice">
                    {message.error}
                  </p>
                )}
                {(message.status === 'failed' || message.status === 'stopped') && (
                  <button
                    type="button"
                    className="agent-panel__restore"
                    disabled={busy || Boolean(draft || attachments.length)}
                    onClick={() => {
                      setDraft(message.text);
                      setAttachments(message.attachments);
                      composer.current?.focus();
                    }}
                  >
                    恢复到输入框
                  </button>
                )}
              </article>
            ))}
          </>
        )}
        {error && (
          <p role="alert" className="agent-panel__notice">
            {error}
          </p>
        )}
        {!selectedModel('chat') && <p className="agent-panel__notice">请先在工作室设置中配置对话模型。</p>}
      </div>
      <form
        className="agent-panel__composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {attachments.length > 0 && (
          <ul className="agent-panel__attachments" aria-label="待发送附件">
            {attachments.map((file, index) => {
              const kind = getAttachmentKind(file);
              const Icon = kind === 'image' ? Image : kind === 'video' ? VideoCamera : File;
              return (
                <li key={index} title={file.name}>
                  <Icon size={15} />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    disabled={busy || storageState === 'loading'}
                    aria-label={`移除 ${file.name}`}
                    onClick={() => {
                      setAttachments((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
                    }}
                  >
                    <X size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {includeCanvas && <p className="agent-panel__notice">当前画布已关联 · 点击画布图标可关闭</p>}
        <textarea
          ref={composer}
          aria-label="消息"
          placeholder="说说你的创意，或添加参考文件…"
          value={draft}
          disabled={busy || storageState === 'loading'}
          maxLength={12000}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div
          className="agent-panel__composer-actions"
          ref={menuRoot}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !openMenu) return;
            event.stopPropagation();
            (openMenu === 'models' ? modelTrigger : skillTrigger).current?.focus();
            setOpenMenu(null);
          }}
        >
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (attachments.length + files.length > 4) {
                setError('每条消息最多添加 4 个参考文件。');
              } else {
                setError('');
                setAttachments((previous) => [...previous, ...files]);
              }
              event.currentTarget.value = '';
            }}
          />
          <FileSourceButton className="agent-panel__icon-button" label="添加附件"
            disabled={busy || storageState === 'loading'}
            onLocal={() => { setOpenMenu(null); picker.current?.click(); }}
            onAsset={async (asset) => {
              if (attachments.length >= 4) throw new Error('每条消息最多添加 4 个参考文件。');
              const file = await readLibraryFile(asset);
              setAttachments((previous) => [...previous, file]);
              setError('');
            }}><Paperclip size={18} /></FileSourceButton>
          <button
            type="button"
            className="agent-panel__icon-button"
            aria-label="引用画布"
            title="引用当前画布、最近运行和可用产物"
            aria-pressed={includeCanvas}
            disabled={busy}
            onClick={() => setIncludeCanvas(!includeCanvas)}
          >
            <Graph size={18} />
          </button>
          <button
            ref={modelTrigger}
            type="button"
            className="agent-panel__icon-button"
            aria-label="选择模型"
            title="选择模型"
            aria-expanded={openMenu === 'models'}
            onClick={() => setOpenMenu(openMenu === 'models' ? null : 'models')}
          >
            <Crosshair size={18} />
          </button>
          <button
            ref={skillTrigger}
            type="button"
            className="agent-panel__icon-button"
            aria-label="Skills 清单"
            title="Skills 清单"
            aria-expanded={openMenu === 'skills'}
            onClick={() => setOpenMenu(openMenu === 'skills' ? null : 'skills')}
          >
            <PuzzlePiece size={18} />
          </button>
          {openMenu === 'models' && !hidden && (
            <section className="ai-parameter-popover agent-panel__popover" aria-label="模型配置">
              {modelOrder.map((kind) => (
                <label key={kind} className="ai-menu-module agent-panel__model-group">
                  <span className="ai-menu-module-label">{modelKinds[kind]}</span>
                  <span className="ai-menu-module-body">
                    <select
                      value={selectedModel(kind)?.value ?? ''}
                      disabled={!models[kind].length}
                      onChange={(event) => setModelIds({ ...modelIds, [kind]: event.target.value })}
                    >
                      {!models[kind].length && <option value="">暂无已配置模型</option>}
                      {models[kind].map((option) => (
                        <option key={option.value} value={option.value}>
                          {[option.label, option.configName || option.group].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              ))}
            </section>
          )}
          {openMenu === 'skills' && !hidden && (
            <section className="ai-parameter-popover agent-panel__popover" aria-label="Skills 清单">
              <div className="ai-menu-module">
                <div className="ai-menu-module-label">Skills</div>
                <div className="ai-menu-module-body agent-panel__skill-options">
                  {skills.map((skill) => (
                    <div key={skill.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSkills.includes(skill.id)}
                          onChange={(event) => {
                            const { checked } = event.currentTarget;
                            setSelectedSkills((current) =>
                              checked ? [...current, skill.id] : current.filter((id) => id !== skill.id),
                            );
                          }}
                        />
                        <span>
                          <strong>{skill.name}</strong>
                          <small>{skill.description || (skill.instructions ? '本地 Skill' : '内置 Skill')}</small>
                        </span>
                      </label>
                      {skill.instructions && (
                        <details>
                          <summary>查看技能正文</summary>
                          <pre>{skill.instructions}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="agent-panel__skill-actions">
                <button type="button" onClick={() => skillPicker.current?.click()}>
                  导入 SKILL.md
                </button>
                <button
                  type="button"
                  disabled={busy || storageState === 'loading'}
                  onClick={() => {
                    setDraft((previous) =>
                      previous
                        ? `${previous}\n\n帮我把以上需求整理成一个可复用的 Skill。`
                        : '帮我创建一个可复用的 Skill。它需要完成：',
                    );
                    setOpenMenu(null);
                    composer.current?.focus();
                  }}
                >
                  通过对话创建
                </button>
              </div>
              {skillError && <p role="alert">{skillError}</p>}
            </section>
          )}
          <input
            type="file"
            accept=".md"
            hidden
            ref={skillPicker}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              setSkillError('');
              try {
                const skill = await readSkillPreview(file);
                addSkill(skill);
              } catch (error) {
                setSkillError(error instanceof Error ? error.message : '无法导入技能。');
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="agent-panel__send"
              onClick={stop}
              aria-label={generatingId ? '停止等待生成' : '停止回复'}
              title={generatingId ? '停止等待生成' : '停止回复'}
            >
              <Stop size={17} weight="fill" />
            </button>
          ) : (
            <button
              type="submit"
              className="agent-panel__send"
              aria-label="发送消息"
              title="发送消息"
              disabled={!canSend}
            >
              <ArrowUp size={17} weight="bold" />
            </button>
          )}
        </div>
      </form>
      {!hidden && mediaPreview && <AgentMediaPreview item={mediaPreview} onClose={() => setMediaPreview(undefined)} />}
    </aside>
  );
}
