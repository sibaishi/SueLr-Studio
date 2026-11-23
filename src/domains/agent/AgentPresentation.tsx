import { IconButton } from '@/ui/CanvasPrimitives';
import { PanelButton, PanelEmptyState, PanelHeader } from '@/ui/PanelPrimitives';
import { TextComposer } from '@/ui/TextComposer';
import { CornersOut, ListBullets, Plus, SidebarSimple, X } from '@phosphor-icons/react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { ArcIcon } from './ArcIcon';
import './agent-panel.css';

/** 正式弧光与演示画板共用的展示组件，不访问模型、会话或项目存储。 */
export function AgentPanelHeader({
  floating,
  sessionsOpen,
  loading,
  onSessions,
  onNew,
  onToggleMode,
  onClose,
  ...props
}: HTMLAttributes<HTMLElement> & {
  floating: boolean;
  sessionsOpen: boolean;
  loading?: boolean;
  onSessions: () => void;
  onNew: () => void;
  onToggleMode: () => void;
  onClose: () => void;
}) {
  return (
    <PanelHeader
      title="弧光"
      description="一起构思、打磨创意"
      className="agent-panel__header"
      {...props}
      actions={
        <>
          <IconButton
            compact
            label="对话列表"
            icon={<ListBullets size={20} />}
            aria-expanded={sessionsOpen}
            onClick={onSessions}
          />
          <IconButton compact label="新会话" icon={<Plus size={20} />} disabled={loading} onClick={onNew} />
          <IconButton
            compact
            label={floating ? '停靠到右侧' : '脱离为浮动窗口'}
            icon={floating ? <SidebarSimple size={20} /> : <CornersOut size={20} />}
            onClick={onToggleMode}
          />
          {floating && <IconButton compact label="关闭弧光" icon={<X size={20} />} onClick={onClose} />}
        </>
      }
    />
  );
}

export function AgentEmptyState({ disabled, onStarter }: { disabled?: boolean; onStarter: (text: string) => void }) {
  return (
    <div className="agent-panel__empty">
      <PanelEmptyState
        icon={<ArcIcon size={24} />}
        title="你想做点什么？"
        action={
          <div className="agent-panel__starters">
            {['一起构思几个方向', '打磨我的创意草稿'].map((text) => (
              <PanelButton key={text} disabled={disabled} onClick={() => onStarter(text)}>
                {text}
              </PanelButton>
            ))}
          </div>
        }
      >
        聊聊你的想法，或添加一份参考素材。
      </PanelEmptyState>
    </div>
  );
}

export function AgentMessage({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-panel-message agent-panel__message ${className}`} {...props} />;
}

export function AgentReply({ children }: { children: ReactNode }) {
  return (
    <div className="agent-panel__reply">
      <strong className="agent-panel__reply-author">弧光</strong>
      {children}
    </div>
  );
}

export function AgentPlanCard({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-panel-card agent-panel__canvas-plan ${className}`} {...props} />;
}

export function AgentComposer({
  onSubmit,
  textareaProps,
  leadingContent,
  children,
}: Pick<ComponentProps<'form'>, 'onSubmit' | 'children'> &
  Pick<ComponentProps<typeof TextComposer>, 'textareaProps' | 'leadingContent'>) {
  return (
    <form className="agent-panel__composer-form" onSubmit={onSubmit}>
      <TextComposer
        className="agent-panel__composer"
        label="消息"
        textareaProps={textareaProps}
        leadingContent={leadingContent}
      >
        {children}
      </TextComposer>
    </form>
  );
}
