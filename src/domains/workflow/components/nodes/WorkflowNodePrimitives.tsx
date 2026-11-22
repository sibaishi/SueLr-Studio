import { Handle } from '@xyflow/react';
import { Warning } from '@phosphor-icons/react';
import type { ComponentProps, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import './node-foundations.css';

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';
export interface WorkflowNodeVisualState {
  status?: ExecutionStatus;
  warning?: boolean;
  disabled?: boolean;
  locked?: boolean;
  selected?: boolean;
}

interface WorkflowNodeSurfaceProps extends HTMLAttributes<HTMLDivElement>, WorkflowNodeVisualState {
  color: string;
  variant?: 'standard' | 'card' | 'group';
}

/** Presentation only: graph state and commands stay with the existing renderers. */
export function WorkflowNodeSurface({
  color,
  variant = 'standard',
  status = 'idle',
  warning,
  disabled,
  locked,
  selected,
  className = '',
  style,
  ...props
}: WorkflowNodeSurfaceProps) {
  return (
    <div
      className={`workflow-node-shell ${className}`}
      data-variant={variant}
      data-status={status}
      data-warning={warning || undefined}
      data-disabled={disabled || undefined}
      data-locked={locked || undefined}
      data-selected={selected || undefined}
      style={{ '--node-color': color, ...style } as CSSProperties}
      {...props}
    />
  );
}

export function WorkflowNodeHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`workflow-node-header ${className}`} {...props} />;
}

export function WorkflowNodeHandle({ className = '', ...props }: ComponentProps<typeof Handle>) {
  return <Handle className={`workflow-node-handle ${className}`} {...props} />;
}

const STATUS_LABELS = { idle: '', running: '执行中', success: '完成', error: '出错' };

export function WorkflowNodeStatus({
  status,
  disabled,
  warning,
  error,
  duration,
}: {
  status: ExecutionStatus;
  disabled?: boolean;
  warning?: string;
  error?: string;
  duration?: string;
}) {
  const pill = (state: string, text: ReactNode, title?: string) => (
    <span className="workflow-node-status" data-state={state} title={title}>
      {text}
    </span>
  );
  return (
    <>
      {disabled && pill('disabled', '已禁用')}
      {warning &&
        status !== 'error' &&
        pill(
          'warning',
          <>
            <Warning size={14} aria-hidden="true" />
            {warning}
          </>,
          warning,
        )}
      {status !== 'idle' &&
        duration &&
        pill(
          status,
          <>
            {STATUS_LABELS[status]} {duration}
          </>,
          `${STATUS_LABELS[status]}${error ? `：${error}` : ''}`,
        )}
    </>
  );
}
