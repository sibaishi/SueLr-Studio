import type { ComponentProps, ReactNode } from 'react';
import { CaretDown, CaretRight, LockOpen, LockSimple } from '@phosphor-icons/react';
import { GROUP_COLLAPSED_LAYOUT, GROUP_EXPANDED_LAYOUT, GROUP_HEADER_HEIGHT } from '@/domains/workflow/lib/groupLayout';
import { WorkflowNodeHeader, WorkflowNodeSurface } from './WorkflowNodePrimitives';
import { WorkflowNodeIcon } from './WorkflowNodeIcon';
import './node.css';

export function WorkflowGroupSurface({
  collapsed = false,
  className = '',
  style,
  ...props
}: ComponentProps<typeof WorkflowNodeSurface> & { collapsed?: boolean }) {
  const layout = collapsed ? GROUP_COLLAPSED_LAYOUT : GROUP_EXPANDED_LAYOUT;
  return (
    <WorkflowNodeSurface
      {...props}
      variant="group"
      className={`flow-node group flow-node--group${collapsed ? ' flow-node--collapsed' : ''} ${className}`}
      style={
        { '--group-padding': `${layout.padding}px`, '--group-gap': `${layout.gap}px`, ...style } as ComponentProps<
          typeof WorkflowNodeSurface
        >['style']
      }
    />
  );
}

export function WorkflowNodeFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flow-node__frame">
      <div className="flow-node__stack">{children}</div>
    </div>
  );
}

export function WorkflowGroupHeader({
  title,
  icon,
  collapsed,
  locked,
  directlyLocked,
  onToggleLocked,
  onToggleCollapsed,
}: {
  title: ReactNode;
  icon: string;
  collapsed: boolean;
  locked: boolean;
  directlyLocked: boolean;
  onToggleLocked: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <WorkflowNodeHeader className="flow-node__header" style={{ minHeight: GROUP_HEADER_HEIGHT }}>
      <span className="flow-node__icon">
        <WorkflowNodeIcon name={icon} size={15} />
      </span>
      {title}
      <button
        type="button"
        className={`flow-node__lock-button nodrag${directlyLocked ? ' flow-node__lock-button--active' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleLocked();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        title={directlyLocked ? '解锁节点' : '锁定节点'}
        aria-label={directlyLocked ? '解锁节点' : '锁定节点'}
      >
        {locked ? <LockSimple size={14} /> : <LockOpen size={14} />}
      </button>
      <button
        type="button"
        className="flow-node__collapse-button nodrag"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        title={collapsed ? '展开节点组' : '折叠节点组'}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开节点组' : '折叠节点组'}
      >
        {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
      </button>
    </WorkflowNodeHeader>
  );
}
