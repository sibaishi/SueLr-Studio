import type { ComponentProps, ReactNode } from 'react';
import { Position } from '@xyflow/react';
import { Copy, LockOpen, LockSimple, Play, Prohibit } from '@phosphor-icons/react';
import { NodeAppendix } from '@/shared/ui/NodeAppendix';
import { WorkflowNodeHandle, WorkflowNodeStatus, WorkflowNodeSurface } from './WorkflowNodePrimitives';
import './node-v2.css';

/** The current AI/IO structure, shared by the editor and the isolated catalogue. */
export function WorkflowCardPresentation({
  toolbar,
  resizer,
  children,
  warning,
  error,
  duration,
  status = 'idle',
  disabled,
  isConnectable = false,
  className = '',
  ...props
}: Omit<ComponentProps<typeof WorkflowNodeSurface>, 'variant' | 'warning'> & {
  toolbar: ReactNode;
  resizer?: ReactNode;
  warning?: string;
  error?: string;
  duration?: string;
  isConnectable?: boolean;
}) {
  return (
    <WorkflowNodeSurface
      {...props}
      variant="card"
      status={status}
      disabled={disabled}
      warning={Boolean(warning) && status !== 'error'}
      className={`flow-node-v2 group ${className}`}
    >
      {toolbar}
      {(disabled || warning || status !== 'idle') && (
        <NodeAppendix position="bottom" showOnHover={false}>
          <WorkflowNodeStatus status={status} disabled={disabled} warning={warning} error={error} duration={duration} />
        </NodeAppendix>
      )}
      {resizer}
      <WorkflowNodeHandle
        type="target"
        position={Position.Left}
        id="input"
        aria-label="输入端口：输入"
        isConnectable={isConnectable}
        style={{ left: -6, top: '50%', transform: 'translateY(-50%)' }}
      />
      <WorkflowNodeHandle
        type="source"
        position={Position.Right}
        id="result"
        aria-label="输出端口：结果"
        isConnectable={isConnectable}
        style={{ right: -6, top: '50%', transform: 'translateY(-50%)' }}
      />
      <div className="flow-node-v2__frame">{children}</div>
    </WorkflowNodeSurface>
  );
}

export function WorkflowCardToolbar({
  children,
  disabled,
  locked,
  onToggleDisabled,
  onToggleLocked,
  onDuplicate,
  onExecute,
}: {
  children: ReactNode;
  disabled?: boolean;
  locked?: boolean;
  onToggleDisabled: () => void;
  onToggleLocked: () => void;
  onDuplicate: () => void;
  onExecute: () => void;
}) {
  const actions = [
    {
      label: disabled ? '启用' : '禁用',
      icon: <Prohibit size={15} style={{ color: disabled ? 'var(--node-state-error)' : undefined }} />,
      run: onToggleDisabled,
    },
    {
      label: locked ? '解锁' : '锁定',
      icon: locked ? <LockSimple size={15} /> : <LockOpen size={15} />,
      run: onToggleLocked,
    },
    { label: '复制', icon: <Copy size={15} />, run: onDuplicate },
    { label: '执行到此节点', icon: <Play size={15} />, run: onExecute, primary: true },
  ];
  return (
    <NodeAppendix position="top">
      <div className="node-v2-appendix-bar">
        {children}
        {actions.map((action) => (
          <div key={action.label} style={{ display: 'contents' }}>
            <div className="node-v2-appendix-divider" />
            <button
              type="button"
              className={`node-v2-appendix-btn${action.primary ? ' node-v2-appendix-btn--primary' : ''}`}
              title={action.label}
              aria-label={action.label}
              onClick={(event) => {
                event.stopPropagation();
                action.run();
              }}
            >
              {action.icon}
            </button>
          </div>
        ))}
      </div>
    </NodeAppendix>
  );
}
