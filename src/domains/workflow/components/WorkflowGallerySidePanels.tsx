import { StatusNotice } from '@/ui/FeedbackPrimitives';
import { Select } from '@/ui/FormPrimitives';
import AgentMarkdown from '@/domains/agent/AgentMarkdown';
import {
  AgentComposer,
  AgentEmptyState,
  AgentMessage,
  AgentPanelHeader,
  AgentPlanCard,
  AgentReply,
} from '@/domains/agent/AgentPresentation';
import SkillLibrary from '@/domains/agent/SkillLibrary';
import { builtinSkills } from '@/domains/agent/builtinSkills';
import { agentResizeEdges, useAgentWindow } from '@/domains/agent/useAgentWindow';
import type { ExecutionLogEntry } from '@/domains/workflow/lib/store/types';
import { IconButton } from '@/ui/CanvasPrimitives';
import { MenuGroup } from '@/ui/MenuPrimitives';
import { PanelButton, PanelSurface } from '@/ui/PanelPrimitives';
import { ArrowUp, Crosshair, Graph, Paperclip, PuzzlePiece, Stop } from '@phosphor-icons/react';
import { useState } from 'react';
import { LogsList, type PanelTab, ResultsList, ResultsPanelView, RunHistoryList } from './ResultsPresentation';
import { galleryImage } from './WorkflowGalleryNode';

export type GallerySidePanel = 'results' | 'agent' | null;
export type GalleryPanelScenario = 'content' | 'empty' | 'loading' | 'error';
const sampleLogs: ExecutionLogEntry[] = [
  { id: 'start', timestamp: 1795334400000, level: 'info', message: '开始执行基础图生图工作流。' },
  { id: 'done', timestamp: 1795334401200, level: 'success', message: '图像生成完成，已保存结果。', nodeId: 'model' },
  {
    id: 'error',
    timestamp: 1795334402400,
    level: 'error',
    message: '演示错误：请检查模型与输入。',
    details: '这是用于检查错误样式的演示记录。',
  },
];

export function GalleryResultsPanel({
  scenario,
  notify,
  onPreview,
}: {
  scenario: GalleryPanelScenario;
  notify: (message: string) => void;
  onPreview: (src: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>('results');
  const [cleared, setCleared] = useState(false);
  const error = scenario === 'error' ? '演示错误：无法读取结果，请稍后重试。' : '';
  const empty = scenario === 'empty';
  return (
    <ResultsPanelView
      tab={tab}
      onTabChange={setTab}
      status={scenario === 'loading' ? '运行中' : error ? '执行失败' : empty ? '尚未运行' : '执行完成'}
      duration={empty ? '还没有运行记录' : '1.2 秒'}
      tone={error ? 'danger' : scenario === 'loading' ? 'accent' : 'neutral'}
      logsLabel="记录"
    >
      <div className="workflow-panel__body workflow-results__body">
        {tab === 'results' ? (
          <>
            <ResultsList
              files={
                empty || scenario === 'loading'
                  ? []
                  : [
                      {
                        generation: {
                          version: 1,
                          runId: 'gallery-run',
                          workflowId: 'gallery',
                          nodeId: 'model',
                          createdAt: 1795334400000,
                          prompt: '保留参考图主体的轮廓与细节，使用明亮、清晰的画面。背景简洁，突出主体层次。',
                          references: [{ url: galleryImage, kind: 'image' }],
                          parameters: {
                            model: '演示图像模型',
                            mode: 'image',
                            ratio: '4:3',
                            n: 1,
                            imageResolution: '2k',
                            output_format: 'png',
                          },
                        },
                        id: 'sample',
                        name: '生成图像示例',
                        relativePath: '演示图像',
                        url: galleryImage,
                        type: 'image',
                        mimeType: 'image/svg+xml',
                        size: 0,
                        modifiedAt: 1795334400000,
                        width: 400,
                        height: 280,
                      },
                    ]
              }
              isLoading={scenario === 'loading'}
              error={error || null}
              onPreviewImage={onPreview}
              onReuseParameters={() => {
                notify('参数复用演示，不修改真实节点。');
                return '演示：已复用参数';
              }}
              onBackfillReferences={() => {
                notify('参考回填演示，不修改真实画布。');
                return '演示：已回填参考素材';
              }}
            />
          </>
        ) : tab === 'logs' ? (
          <LogsList
            logs={empty || cleared ? [] : sampleLogs}
            onClear={() => {
              setCleared(true);
              notify('已清空演示记录，不影响真实执行记录。');
            }}
          />
        ) : (
          <RunHistoryList
            entries={
              scenario === 'loading'
                ? null
                : empty
                  ? []
                  : [
                      {
                        runId: 'gallery-run',
                        status: error ? 'failed' : 'completed',
                        startedAt: 1795334400000,
                        totalDuration: 1200,
                        nodeCount: 3,
                        failures: [],
                        outputs: [],
                        inputs: [{ nodeId: '参考输入', text: '保留主体细节', files: [] }],
                        recoverableVideos: [{ id: 'sample-video', nodeId: '演示视频节点' }],
                      },
                    ]
            }
            error={error}
            onRefresh={() => notify('已刷新演示历史，不读取真实运行历史。')}
            onRecover={() => notify('视频恢复按钮演示，不发送恢复请求。')}
          />
        )}
      </div>
    </ResultsPanelView>
  );
}

export function GalleryAgentPanel({
  scenario,
  notify,
  onClose,
  onFloatingChange,
  floating,
}: {
  scenario: GalleryPanelScenario;
  notify: (message: string) => void;
  onClose: () => void;
  onFloatingChange: (floating: boolean) => void;
  floating: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [menu, setMenu] = useState<'models' | 'skills' | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [includeCanvas, setIncludeCanvas] = useState(true);
  const [attached, setAttached] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [applied, setApplied] = useState(false);
  const [model, setModel] = useState('demo-chat');
  const window = useAgentWindow();
  const bounds = floating ? window.bounds : undefined;
  const busy = scenario === 'loading' && !stopped;
  return (
    <PanelSurface
      ref={window.panel}
      className={`workflow-panel agent-panel ${floating ? 'agent-panel--floating' : 'workflow-results'}`}
      style={bounds ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined}
      aria-label="弧光"
    >
      <AgentPanelHeader
        floating={floating}
        sessionsOpen={sessionsOpen}
        onSessions={() => setSessionsOpen(!sessionsOpen)}
        onNew={() => {
          setSent(false);
          setDraft('');
          notify('已重置演示对话，不修改真实会话。');
        }}
        onToggleMode={() => {
          if (!floating) window.place();
          onFloatingChange(!floating);
        }}
        onClose={onClose}
        onPointerDown={floating ? (event) => window.begin(event) : undefined}
        onPointerMove={window.move}
        onPointerUp={window.end}
        onPointerCancel={window.end}
        onLostPointerCapture={window.end}
      />
      {sessionsOpen && (
        <nav className="agent-panel__session-list" aria-label="对话列表">
          <button type="button" aria-current="true" onClick={() => setSessionsOpen(false)}>
            基础图生图 · 演示对话
          </button>
        </nav>
      )}
      <div className="workflow-panel__body agent-panel__timeline" role="log" aria-label="对话">
        {scenario === 'empty' && !sent ? (
          <AgentEmptyState onStarter={setDraft} />
        ) : (
          <article className="agent-panel__turn">
            <AgentMessage>
              帮我整理这个图生图流程。<div className="agent-panel__message-options">画布 · 基础图生图</div>
            </AgentMessage>
            {!busy && (
              <AgentReply>
                <AgentMarkdown
                  source={
                    '可以分成三个步骤：\n\n1. 添加参考图\n2. 选择图像模型并填写提示词\n3. 检查输出结果\n\n| 节点 | 作用 |\n| --- | --- |\n| 参考输入 | 提供图片 |\n| AI 图像生成 | 生成结果 |\n\n```json\n{"ratio":"4:3","count":1}\n```'
                  }
                />
              </AgentReply>
            )}
            {!busy && (
              <AgentPlanCard aria-label="画布修改方案">
                <strong>画布修改方案</strong>
                <ol>
                  <li>添加参考输入节点</li>
                  <li>连接图像模型与输出节点</li>
                </ol>
                <PanelButton
                  disabled={applied}
                  onClick={() => {
                    setApplied(true);
                    notify('方案状态演示，不修改画布。');
                  }}
                >
                  {applied ? '已应用' : '应用到画布'}
                </PanelButton>
              </AgentPlanCard>
            )}
            {!busy && (
              <AgentPlanCard className="agent-panel__generation" aria-label="生成方案">
                <h3>直接生成图像</h3>
                <p className="agent-panel__generation-meta">演示图像模型 · 4:3 · 1 张</p>
                <details>
                  <summary>提示词</summary>
                  <div>明亮、清晰，保留主体细节。</div>
                </details>
                <div className="agent-panel__generation-media">
                  <div className="agent-panel__generation-item">
                    <img src={galleryImage} alt="生成图像演示" />
                  </div>
                </div>
              </AgentPlanCard>
            )}
            {busy && (
              <StatusNotice className="ui-status-notice--compact" role="status">
                弧光正在处理消息…
              </StatusNotice>
            )}
            {stopped && <p className="agent-panel__notice">已停止回复。</p>}
            {scenario === 'error' && (
              <>
                <StatusNotice tone="error" className="ui-status-notice--compact" role="alert">
                  演示错误：连接不可用，请检查配置。
                </StatusNotice>
                <PanelButton className="agent-panel__restore" onClick={() => setDraft('帮我整理这个图生图流程。')}>
                  恢复到输入框
                </PanelButton>
              </>
            )}
          </article>
        )}
      </div>
      <AgentComposer
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim() || busy) return;
          setSent(true);
          setDraft('');
          notify('发送交互演示，不调用模型，也不保存会话。');
        }}
        textareaProps={{
          placeholder: '说说你的创意，或添加参考文件…',
          value: draft,
          disabled: busy,
          rows: 3,
          onChange: (event) => setDraft(event.target.value),
        }}
        leadingContent={
          <>
            {attached && (
              <ul className="agent-panel__attachments" aria-label="待发送附件">
                <li>
                  <Paperclip size={16} />
                  <span>参考图片.png</span>
                  <button type="button" aria-label="移除演示附件" onClick={() => setAttached(false)}>
                    ×
                  </button>
                </li>
              </ul>
            )}
            {includeCanvas && <p className="agent-panel__notice">当前画布已关联 · 点击画布图标可关闭</p>}
          </>
        }
      >
        <div
          className="agent-panel__composer-actions"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenu(null);
          }}
        >
          <IconButton
            compact
            label="添加附件"
            icon={<Paperclip size={20} />}
            disabled={busy}
            onClick={() => setAttached(!attached)}
          />
          <IconButton
            compact
            label="引用画布"
            icon={<Graph size={20} />}
            pressed={includeCanvas}
            onClick={() => setIncludeCanvas(!includeCanvas)}
          />
          <IconButton
            compact
            label="选择模型"
            icon={<Crosshair size={20} />}
            aria-expanded={menu === 'models'}
            onClick={() => setMenu(menu === 'models' ? null : 'models')}
          />
          <IconButton
            compact
            label="Skills 清单"
            icon={<PuzzlePiece size={20} />}
            aria-expanded={menu === 'skills'}
            onClick={() => setMenu(menu === 'skills' ? null : 'skills')}
          />
          {menu === 'models' && (
            <section className="menu-surface ui-menu-popover agent-panel__popover" aria-label="模型配置">
              <MenuGroup label="对话模型">
                <label className="agent-panel__model-group">
                  <Select aria-label="演示对话模型" value={model} onChange={setModel}>
                    <option value="demo-chat">演示对话模型</option>
                    <option value="demo-chat-2">演示对话模型 B</option>
                  </Select>
                </label>
              </MenuGroup>
            </section>
          )}
          {menu === 'skills' && (
            <section
              className="menu-surface ui-menu-popover agent-panel__popover agent-skills-popover"
              aria-label="Skills 清单"
            >
              <SkillLibrary
                skills={builtinSkills}
                selected={selectedSkills}
                onToggle={(id, enabled) =>
                  setSelectedSkills((current) => (enabled ? [...current, id] : current.filter((item) => item !== id)))
                }
                onSave={() => notify('技能保存入口演示，不保存设置。')}
                onRemove={() => notify('技能移除入口演示，不删除技能。')}
              />
            </section>
          )}
          {busy ? (
            <button type="button" className="agent-panel__send" aria-label="停止回复" onClick={() => setStopped(true)}>
              <Stop size={20} />
            </button>
          ) : (
            <button type="submit" className="agent-panel__send" aria-label="发送消息" disabled={!draft.trim()}>
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </AgentComposer>
      {floating &&
        agentResizeEdges.map((edge) => (
          <div
            key={edge}
            className="agent-panel__resize"
            data-resize-edge={edge}
            aria-hidden="true"
            onPointerDown={(event) => window.begin(event, edge)}
            onPointerMove={window.move}
            onPointerUp={window.end}
            onPointerCancel={window.end}
            onLostPointerCapture={window.end}
          />
        ))}
    </PanelSurface>
  );
}
