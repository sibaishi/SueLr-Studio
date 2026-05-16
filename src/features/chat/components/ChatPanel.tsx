import { useEffect, useMemo } from 'react';
import type { AgentRole, ApiConfig, BridgeRef, Colors, ModelInfo } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { getModelDisplayName, getModelGroupName } from '@/lib/model-routing';
import { useChat } from '../hooks/useChat';
import { useT } from '@/contexts/ThemeContext';
import { MarkdownRenderer } from '@/shared/ui/content/Markdown';
import { AutoTextarea, CustomDropdown, FullscreenViewer, RoleSelector, TypingIndicator } from '@/shared/ui/ios';
import { Bot, CheckCircle, Circle, Copy, FileText, Gauge, ImageIcon, Layers, MessageSquare, Paperclip, RefreshCw, Search, Sparkles, Trash2, X, XCircle } from 'lucide-react';

const DEFAULT_CONTEXT_WINDOW = 128000;
const CHARS_PER_TOKEN = 3.5;
const PENDING_IMAGE_TOKEN_ESTIMATE = 768;

const WELCOME_SUGGESTIONS = [
  '帮我写一篇文章',
  '解释一段代码',
  '整理一份会议纪要',
  '帮我规划一个项目',
];

function panelStyle(): React.CSSProperties {
  return {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 24,
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-shadow)',
  };
}

function mutedPanelStyle(): React.CSSProperties {
  return {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 18,
  };
}

function chipStyle(accent?: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid var(--color-border)',
    background: accent ? `${accent}18` : 'var(--color-bg-secondary)',
    color: accent || 'var(--color-text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

function eyebrowStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

function estimateTokensFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.round(trimmed.length / CHARS_PER_TOKEN));
}

function getContextStatus(usagePct: number, T: Colors) {
  if (usagePct >= 85) {
    return { label: '接近上限', color: T.red, hint: '建议先总结或开启新会话，避免重要内容被模型遗忘。' };
  }
  if (usagePct >= 60) {
    return { label: '偏高', color: T.orange, hint: '上下文仍可用，但长附件和多轮追问会明显增加压力。' };
  }
  return { label: '健康', color: T.green, hint: '当前上下文余量充足，可以继续正常对话。' };
}

function ContextUsagePanel({
  stats,
  T,
}: {
  stats: {
    contextWindow: number;
    totalTokens: number;
    remainingTokens: number;
    usagePct: number;
    totalChars: number;
    messageCount: number;
    compressed: boolean;
    status: ReturnType<typeof getContextStatus>;
    source: 'provider' | 'estimate';
    breakdown: Array<{ label: string; value: number; meta: string; color: string; icon: React.ReactNode }>;
  };
  T: Colors;
}) {
  return (
    <div style={{ ...mutedPanelStyle(), padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>上下文用量</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {stats.source === 'provider' ? '来自上游 usage，明细为本地估算' : '后端估算，含角色提示与待发内容'}
          </div>
        </div>
        <span style={{ ...chipStyle(stats.status.color), padding: '6px 9px' }}>{stats.status.label}</span>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: '50%',
            background: `conic-gradient(${stats.status.color} ${stats.usagePct}%, var(--color-bg-secondary) 0)`,
            padding: 7,
            boxShadow: `0 12px 30px ${stats.status.color}18`,
          }}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Gauge size={18} color={stats.status.color} />
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginTop: 4 }}>{stats.usagePct}%</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>已使用</div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 23, fontWeight: 800, color: stats.status.color }}>{stats.totalTokens.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>/ {stats.contextWindow.toLocaleString()} tokens 阈值</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 5 }}>
            预计还可容纳 {stats.remainingTokens.toLocaleString()} tokens
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'var(--color-bg-secondary)', overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: `${stats.usagePct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${T.green}, ${stats.status.color})`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-tertiary)', marginTop: 8 }}>{stats.status.hint}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        {stats.breakdown.map((item) => (
          <div key={item.label} style={{ borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--glass-bg)', padding: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: item.color, fontSize: 11, fontWeight: 700 }}>
              {item.icon}
              <span>{item.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 6 }}>{item.value.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, color: 'var(--color-text-tertiary)', fontSize: 11 }}>
        <span>{stats.messageCount} 条消息 · {stats.totalChars.toLocaleString()} 字符</span>
        {stats.compressed && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.purple, fontWeight: 700 }}>
            <Sparkles size={10} />
            已压缩
          </span>
        )}
      </div>
    </div>
  );
}

function InlineHint({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ ...mutedPanelStyle(), padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 6 }}>{body}</div>
    </div>
  );
}

export function ChatPanel({
  base,
  apiKey,
  apiConfigs,
  models,
  addLog,
  bridgeRef,
  roles,
  getMemoryContext,
  refreshMemories,
  scheduleExtraction,
  tavilyApiKey,
  providerConfig,
  chatStreamingMode,
  imageStreamingMode: _imageStreamingMode,
  videoStreamingMode,
  activeTab,
  searchMemories,
  onBusyChange,
  onOpenWorkflowRun,
}: {
  base: string;
  apiKey: string;
  apiConfigs: ApiConfig[];
  models: ModelInfo[];
  addLog: (level: string, message: string) => void;
  bridgeRef: React.MutableRefObject<BridgeRef>;
  roles: AgentRole[];
  getMemoryContext: () => string;
  refreshMemories: () => Promise<void>;
  scheduleExtraction: (msgs: { role: string; content: string }[], cid: string, model: string, base: string, key: string) => void;
  tavilyApiKey: string;
  providerConfig?: ProviderConfig;
  chatStreamingMode: 'stream' | 'non-stream';
  imageStreamingMode: 'stream' | 'non-stream';
  videoStreamingMode: 'stream' | 'non-stream';
  activeTab?: string;
  searchMemories?: (query: string) => string;
  onBusyChange?: (busy: boolean) => void;
  onOpenWorkflowRun?: (payload: { runId: string; workflowId?: string; source?: 'persisted' | 'draft' }) => void;
}) {
  const T = useT();
  const chat = useChat(base, apiKey, apiConfigs, models, addLog, bridgeRef, roles, getMemoryContext, refreshMemories, scheduleExtraction, tavilyApiKey, providerConfig, chatStreamingMode, videoStreamingMode, activeTab, searchMemories);
  const chatBusy = chat.sendings.size > 0;

  useEffect(() => {
    onBusyChange?.(chatBusy);
    return () => {
      onBusyChange?.(false);
    };
  }, [chatBusy, onBusyChange]);

  const modelOptions = chat.chatModels.map((model) => ({ label: getModelDisplayName(model), value: model.id, group: getModelGroupName(model) }));
  const currentModelLabel = modelOptions.find((option) => option.value === chat.currentModel)?.label || '未选择';
  const activeRole = roles.find((role) => role.id === chat.currentRole.id);
  const activeConversation = chat.conv;
  const contextUsage = useMemo(() => {
    const totalChars = activeConversation.msgs.reduce((sum, msg) => sum + (typeof msg.content === 'string' ? msg.content.length : 0), 0);
    const messageTokens = estimateTokensFromText(activeConversation.msgs.map((msg) => msg.content).join('\n\n'));
    const roleTokens = estimateTokensFromText(activeRole?.systemPrompt || chat.currentRole.systemPrompt || '');
    const pendingFileChars = chat.pendingFiles.reduce((sum, file) => sum + file.name.length + file.content.length, 0);
    const pendingFileTokens = estimateTokensFromText(chat.pendingFiles.map((file) => `${file.name}\n${file.content}`).join('\n\n'));
    const pendingImageTokens = chat.pendingImages.length * PENDING_IMAGE_TOKEN_ESTIMATE;
    const estimatedTotalTokens = messageTokens + roleTokens + pendingFileTokens + pendingImageTokens;
    const serverUsage = chat.tokenUsage;
    const contextWindow = serverUsage?.compressionThreshold || DEFAULT_CONTEXT_WINDOW;
    const totalTokens = serverUsage?.totalTokens ?? estimatedTotalTokens;
    const usagePct = Math.min(100, serverUsage?.usagePct ?? Math.round((totalTokens / contextWindow) * 100));
    const remainingTokens = Math.max(0, serverUsage?.remainingTokens ?? (contextWindow - totalTokens));
    const status = getContextStatus(usagePct, T);
    const compressed = activeConversation.msgs.some((msg) =>
      msg.role === 'assistant' && (
        msg.toolCall?.name === 'conversation_summarize' ||
        (typeof msg.content === 'string' && msg.content.includes('[Previous conversation summary]'))
      )
    );

    return {
      contextWindow,
      totalTokens,
      remainingTokens,
      usagePct,
      totalChars,
      messageCount: activeConversation.msgs.length,
      compressed,
      status,
      source: serverUsage?.source || 'estimate' as const,
      breakdown: [
        {
          label: '历史消息',
          value: messageTokens,
          meta: `${activeConversation.msgs.length} 条`,
          color: T.blue,
          icon: <MessageSquare size={12} />,
        },
        {
          label: '角色提示',
          value: roleTokens,
          meta: activeRole?.name || chat.currentRole.name || '默认角色',
          color: T.purple,
          icon: <Layers size={12} />,
        },
        {
          label: '待发文件',
          value: pendingFileTokens,
          meta: `${chat.pendingFiles.length} 个 · ${pendingFileChars.toLocaleString()} 字符`,
          color: chat.pendingFiles.length > 0 ? T.orange : 'var(--color-text-tertiary)',
          icon: <FileText size={12} />,
        },
        {
          label: '待发图片',
          value: pendingImageTokens,
          meta: `${chat.pendingImages.length} 张 · 视觉估算`,
          color: chat.pendingImages.length > 0 ? T.green : 'var(--color-text-tertiary)',
          icon: <ImageIcon size={12} />,
        },
      ],
    };
  }, [T, activeConversation.msgs, activeRole?.name, activeRole?.systemPrompt, chat.currentRole.name, chat.currentRole.systemPrompt, chat.pendingFiles, chat.pendingImages.length, chat.tokenUsage]);
  const conversations = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
        <div style={eyebrowStyle()}>Conversations</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>对话列表</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 6 }}>管理历史会话并快速切换上下文。</div>
        <button
          onClick={() => { chat.newConv(); }}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '11px 14px',
            borderRadius: 14,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            color: T.green,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          新建对话
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chat.convs.map((conv) => {
            const lastMsg = conv.msgs.at(-1);
            const active = conv.id === chat.activeId;
            return (
              <div
                key={conv.id}
                onClick={() => { chat.setActiveId(conv.id); }}
                style={{
                  ...mutedPanelStyle(),
                  padding: 14,
                  cursor: 'pointer',
                  background: active ? `${T.blue}14` : 'var(--color-bg-secondary)',
                  borderColor: active ? `${T.blue}44` : 'var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                    {lastMsg && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastMsg.role === 'user' ? '你' : 'AI'}: {lastMsg.content.slice(0, 48)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(event) => { event.stopPropagation(); chat.delConv(conv.id); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="workflow-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <FullscreenViewer
        url={chat.previewUrl}
        onClose={() => chat.setPreviewUrl(null)}
        actionLabel="添加到对话"
        onAction={(url) => {
          chat.addPendingImages([url]);
          addLog('info', '已将图片添加到 Chat 待发送队列');
        }}
      />

      <div className="workflow-toolbar glass" style={{ marginBottom: 0 }}>
        <div className="workflow-toolbar__frame" style={{ alignItems: 'stretch', flexWrap: 'wrap', rowGap: 12 }}>
          <div className="workflow-toolbar__identity" style={{ minWidth: 220, alignItems: 'flex-start' }}>
            <div className="workflow-toolbar__badge">
              <MessageSquare size={20} />
            </div>
            <div>
              <div style={eyebrowStyle()}>Chat</div>
              <div className="workflow-toolbar__title" style={{ fontSize: 18 }}>对话工作台</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                在同一界面里管理会话、角色、模型和生成上下文。
              </div>
            </div>
          </div>

          <div className="workflow-toolbar__status" style={{ minWidth: 260, flex: 1, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>当前会话</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>{activeConversation.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={chipStyle(T.blue)}>{activeRole?.name || '默认角色'}</span>
              <span style={chipStyle(chat.currentModel ? T.green : undefined)}>{currentModelLabel}</span>
              <span style={chipStyle(chat.webSearchEnabled ? T.purple : undefined)}>{chat.webSearchEnabled ? '联网搜索已开' : '联网搜索已关'}</span>
            </div>
          </div>

          {chat.sendings.has(chat.conv.id) && (
            <div className="workflow-toolbar__group workflow-toolbar__group--actions" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
              {chat.sendings.has(chat.conv.id) && <button onClick={() => chat.cancel(chat.conv.id)} style={{ padding: '8px 14px', borderRadius: 12, border: '1px solid transparent', background: `${T.red}18`, color: T.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>终止生成</button>}
            </div>
          )}
        </div>
      </div>

      <div className="workflow-shell" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 320px', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        <aside style={{ ...panelStyle(), overflow: 'hidden', minWidth: 0 }}>
          {conversations}
        </aside>

        <section style={{ ...panelStyle(), minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <RoleSelector roles={roles} activeRoleId={chat.currentRole.id} onSelect={chat.setRole} />
            <CustomDropdown value={chat.currentModel} onChange={chat.setConvModel} placeholder="选择对话模型" options={modelOptions} style={{ flex: 1, minWidth: 220 }} />
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button
                onClick={() => chat.fileInputRef.current?.click()}
                style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                title="添加附件"
              >
                <Paperclip size={16} />
              </button>
              <button
                onClick={() => {
                  if (chatBusy || activeConversation.msgs.length === 0) return;
                  chat.setInput('请总结当前对话的关键内容');
                  setTimeout(() => chat.send(), 0);
                }}
                disabled={chatBusy || activeConversation.msgs.length === 0}
                title={activeConversation.msgs.length === 0 ? '暂无对话可总结' : '总结当前对话'}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${activeConversation.msgs.length > 0 && !chatBusy ? `${T.purple}44` : 'var(--color-border)'}`,
                  background: activeConversation.msgs.length > 0 && !chatBusy ? `${T.purple}14` : 'var(--color-bg-secondary)',
                  color: activeConversation.msgs.length > 0 && !chatBusy ? T.purple : 'var(--color-text-tertiary)',
                  cursor: activeConversation.msgs.length > 0 && !chatBusy ? 'pointer' : 'not-allowed',
                  opacity: activeConversation.msgs.length > 0 && !chatBusy ? 1 : 0.55,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <Sparkles size={16} />
              </button>
              <button
                onClick={() => chat.canUseWebSearch && chat.setWebSearchEnabled(!chat.webSearchEnabled)}
                disabled={!chat.canUseWebSearch}
                title={chat.canUseWebSearch ? (chat.webSearchEnabled ? '关闭联网搜索' : '开启联网搜索') : '请先在设置中配置 Tavily API Key'}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${chat.webSearchEnabled ? T.blue : 'var(--color-border)'}`,
                  background: chat.webSearchEnabled ? `${T.blue}16` : 'var(--color-bg-secondary)',
                  color: chat.canUseWebSearch ? (chat.webSearchEnabled ? T.blue : 'var(--color-text-secondary)') : 'var(--color-text-tertiary)',
                  cursor: chat.canUseWebSearch ? 'pointer' : 'not-allowed',
                  opacity: chat.canUseWebSearch ? 1 : 0.55,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <Search size={16} />
              </button>
            </div>
          </div>

          <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {chat.conv.msgs.length === 0 && (
              <div style={{ margin: 'auto', maxWidth: 560, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: 20, background: `${T.blue}16`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
                  <MessageSquare size={26} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>开始一个新对话</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>输入问题、粘贴素材，或直接使用下面的快捷提示词开始。</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {WELCOME_SUGGESTIONS.map((text) => (
                    <button key={text} onClick={() => chat.setInput(text)} style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.conv.msgs.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10 }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 34, height: 34, borderRadius: 14, background: `${T.blue}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: T.blue }}>
                    <Bot size={16} />
                  </div>
                )}

                <div
                  style={{
                    maxWidth: '76%',
                    borderRadius: 22,
                    padding: '14px 16px',
                    background: msg.role === 'user' ? `linear-gradient(135deg, ${T.green}, ${T.blue})` : 'var(--color-bg-secondary)',
                    border: msg.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                    boxShadow: msg.role === 'user' ? `0 12px 28px ${T.blue}20` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: msg.role === 'user' ? 'rgba(255,255,255,0.72)' : 'var(--color-text-tertiary)' }}>{msg.role === 'user' ? '你' : activeRole?.name || 'AI'}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => navigator.clipboard.writeText(msg.content)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}><Copy size={11} /></button>
                      {msg.role === 'assistant' && <button onClick={() => chat.regenerate(msg.id)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}><RefreshCw size={11} /></button>}
                      <button onClick={() => chat.deleteMessage(msg.id)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}><Trash2 size={11} /></button>
                    </span>
                  </div>

                  {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} isUser={false} /> : <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>}

                  {msg.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {msg.images.map((img, index) => (
                        <img key={index} src={img} onClick={() => chat.setPreviewUrl(img)} style={{ maxWidth: 260, maxHeight: 280, borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)' }} />
                      ))}
                    </div>
                  )}

                  {msg.toolCall && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 12, fontSize: 12, border: '1px solid var(--color-border)', color: msg.toolCall.status === 'failed' ? T.red : msg.toolCall.status === 'done' ? T.green : msg.toolCall.status === 'cancelled' ? T.orange : T.blue, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {msg.toolCall.status === 'processing'
                          ? <Circle size={8} fill="currentColor" />
                          : msg.toolCall.status === 'failed'
                            ? <XCircle size={12} />
                            : msg.toolCall.status === 'cancelled'
                              ? <XCircle size={12} />
                              : <CheckCircle size={12} />}
                        {msg.toolCall.label}
                      </span>
                      {(msg.toolCall.runId || msg.toolCall.detail || msg.toolCall.error) && (
                        <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                          {msg.toolCall.error || msg.toolCall.detail || (msg.toolCall.runId ? `runId: ${msg.toolCall.runId}` : '')}
                        </span>
                      )}
                      {msg.toolCall.type === 'workflow' && msg.toolCall.runId && (
                        <button
                          onClick={() => onOpenWorkflowRun?.({
                            runId: msg.toolCall?.runId || '',
                            workflowId: msg.toolCall?.workflowId,
                            source: msg.toolCall?.source,
                          })}
                          style={{
                            marginTop: 2,
                            border: 'none',
                            background: 'transparent',
                            color: T.blue,
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 11,
                            fontWeight: 700,
                            textDecoration: 'underline',
                          }}
                        >
                          在 Workflow 页面中查看运行
                        </button>
                      )}
                      {Array.isArray(msg.toolCall.artifacts) && msg.toolCall.artifacts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%' }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{msg.toolCall.type === 'workflow' ? '工作流输出' : '工具输出'}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {msg.toolCall.artifacts.map((artifact, index) => {
                              if (artifact.type === 'image') {
                                return (
                                  <img
                                    key={`${artifact.url}-${index}`}
                                    src={artifact.url}
                                    onClick={() => chat.setPreviewUrl(artifact.url)}
                                    style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--color-border)' }}
                                  />
                                );
                              }

                              if (artifact.type === 'video') {
                                return (
                                  <video
                                    key={`${artifact.url}-${index}`}
                                    src={artifact.url}
                                    controls
                                    style={{ width: 180, maxHeight: 120, borderRadius: 12, border: '1px solid var(--color-border)', background: '#000' }}
                                  />
                                );
                              }

                              if (artifact.type === 'audio') {
                                return (
                                  <audio
                                    key={`${artifact.url}-${index}`}
                                    src={artifact.url}
                                    controls
                                    style={{ width: 220 }}
                                  />
                                );
                              }

                              return (
                                <a
                                  key={`${artifact.url}-${index}`}
                                  href={artifact.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 8px',
                                    borderRadius: 10,
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                    textDecoration: 'none',
                                    maxWidth: 220,
                                  }}
                                >
                                  <FileText size={12} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {artifact.name || artifact.url}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {chat.sendings.has(chat.conv.id) && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 14, background: `${T.blue}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
                  <Bot size={16} />
                </div>
                <div style={{ borderRadius: 20, padding: '12px 16px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
          </main>

          <footer style={{ padding: 16, borderTop: '1px solid var(--color-border)', background: 'var(--glass-bg)' }}>
            {(chat.pendingImages.length > 0 || chat.pendingFiles.length > 0) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {chat.pendingImages.map((img, index) => (
                  <div key={`img-${index}`} style={{ position: 'relative', width: 60, height: 60 }}>
                    <img src={img} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--color-border)' }} />
                    <button onClick={() => chat.removePendingImage(index)} style={{ position: 'absolute', top: 3, right: 3, border: 'none', borderRadius: 10, width: 20, height: 20, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer' }}><X size={10} /></button>
                  </div>
                ))}
                {chat.pendingFiles.map((file) => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 220, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                    <FileText size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <button onClick={() => chat.removePendingFile(file.id)} style={{ border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <input ref={chat.fileInputRef} type="file" accept="image/*,.txt,.md,.markdown,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.c,.cpp,.h,.hpp,.yaml,.yml,.toml,.ini,.log" multiple onChange={(event) => { if (event.target.files) chat.handleFileUpload(event.target.files); event.target.value = ''; }} style={{ display: 'none' }} />
              <div style={{ flex: 1 }}>
                <AutoTextarea
                  value={chat.input}
                  onChange={chat.setInput}
                  placeholder={chat.currentModelDisabledReason || '输入消息...（Enter 发送，Shift+Enter 换行）'}
                  maxH={140}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void chat.send(); } }}
                  disabled={Boolean(chat.currentModelDisabledReason)}
                  style={{ borderRadius: 16, minHeight: 46, padding: '12px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <button
                onClick={() => void chat.send()}
                disabled={!chat.canSend}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  border: 'none',
                  background: !chat.canSend ? 'var(--color-bg-secondary)' : `linear-gradient(135deg, ${T.green}, ${T.blue})`,
                  color: !chat.canSend ? 'var(--color-text-tertiary)' : '#fff',
                  cursor: chat.canSend ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                发送
              </button>
            </div>
          </footer>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflow: 'auto' }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <div style={eyebrowStyle()}>Context</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>会话侧写</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>当前角色</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{activeRole?.name || '默认角色'}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>角色会影响系统提示词与可用工具。</div>
              </div>
              <ContextUsagePanel stats={contextUsage} T={T} />
              <div style={{ ...mutedPanelStyle(), padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>能力状态</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={chipStyle(chat.currentModel ? T.green : undefined)}>{chat.currentModel ? '模型可用' : '还没有选择模型'}</span>
                  <span style={chipStyle(chat.canUseWebSearch ? T.purple : undefined)}>{chat.canUseWebSearch ? '联网搜索可用' : '联网搜索未启用'}</span>
                  <span style={chipStyle(apiKey ? T.blue : undefined)}>{apiKey ? 'API Key 已配置' : 'API Key 还未配置'}</span>
                </div>
                {(!chat.currentModel || !apiKey || !chat.canUseWebSearch) && (
                  <div style={{ marginTop: 10 }}>
                    <InlineHint
                      title="当前能力还未完全就绪"
                      body={!apiKey
                        ? '先在设置中填写 API Key，再选择模型并发送消息。'
                        : !chat.currentModel
                          ? '当前还没有选中对话模型，选择后即可开始发送消息。'
                          : '如需联网搜索，请先在设置中配置 Tavily API Key。'}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
