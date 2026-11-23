import { MenuItem } from '@/ui/MenuPrimitives';
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from 'react';
import type { NODE_REGISTRY } from '@/domains/workflow/lib/constants';
import { WorkflowNodeIcon } from './nodes/WorkflowNodeIcon';

function CanvasMenuSurface({ className, onDismiss, ...props }: ComponentProps<'div'> & { onDismiss: () => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    const surface = surfaceRef.current;
    const initial = surface?.querySelector<HTMLButtonElement>('button:not(:disabled)') || surface;
    initial?.focus({ preventScroll: true });

    return () => {
      if (surface?.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      {...props}
      ref={surfaceRef}
      className={`menu-surface ui-menu-surface workflow-context-menu ${className}`}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.key === 'Escape') event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onDismiss();
        }
      }}
    />
  );
}

export function CanvasContextMenu({
  x,
  y,
  label,
  children,
  onDismiss,
}: { x: number; y: number; label: string; children: ReactNode; onDismiss: () => void }) {
  return (
    <CanvasMenuSurface
      className="workflow-context-menu--root"
      style={{ left: x, top: y }}
      role="group"
      aria-label={label}
      onDismiss={onDismiss}
    >
      <div className="menu-group">
        <div className="workflow-context-menu__actions">{children}</div>
      </div>
    </CanvasMenuSurface>
  );
}

export function ContextMenuButton({
  label,
  onClick,
  danger = false,
  disabled = false,
  title,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <MenuItem onClick={onClick} disabled={disabled} tone={danger ? 'danger' : undefined} title={title ?? label}>
      {label}
    </MenuItem>
  );
}

export function CanvasNodeCatalog({
  connecting = false,
  nodeDefs,
  onChoose,
  onDismiss,
}: {
  connecting?: boolean;
  nodeDefs: readonly (typeof NODE_REGISTRY)[number][];
  onChoose: (type: string) => void;
  onDismiss: () => void;
}) {
  const title = connecting ? '连接到新节点' : '新建节点';

  return (
    <div className="workflow-context-panel-layer" onClick={onDismiss}>
      <CanvasMenuSurface
        className="workflow-context-menu--panel"
        role="dialog"
        aria-label={title}
        onDismiss={onDismiss}
      >
        <div className="workflow-context-menu__catalog menu-group">
          <header className="workflow-context-menu__catalog-header">
            <h2 className="workflow-context-menu__catalog-title">{title}</h2>
            <p className="workflow-context-menu__catalog-subtitle">
              {connecting ? '只显示当前端口可以连接的节点' : '选择一个节点插入到画布'}
            </p>
          </header>
          <div className="workflow-context-menu__node-list">
            {nodeDefs.map((nodeDef) => (
              <NodeCatalogButton key={nodeDef.type} nodeDef={nodeDef} onClick={() => onChoose(nodeDef.type)} />
            ))}
          </div>
        </div>
      </CanvasMenuSurface>
    </div>
  );
}

function NodeCatalogButton({
  nodeDef,
  onClick,
}: {
  nodeDef: (typeof NODE_REGISTRY)[number];
  onClick: () => void;
}) {
  const inputCount = nodeDef.maxInputs ? `${nodeDef.maxInputs}+` : String(nodeDef.inputs.length);
  const outputCount = String(nodeDef.outputs.length);

  return (
    <MenuItem
      className="workflow-context-menu__node-card"
      data-testid={`workflow-node-catalog-item-${nodeDef.type}`}
      onClick={onClick}
      title={nodeDef.label}
    >
      <span
        className="workflow-context-menu__node-icon"
        style={{
          color: nodeDef.color || '#8E8E93',
          background: `${nodeDef.color || '#8E8E93'}12`,
          border: `1px solid ${nodeDef.color || '#8E8E93'}20`,
        }}
        aria-hidden="true"
      >
        <WorkflowNodeIcon name={nodeDef.icon} size={17} />
      </span>
      <span className="workflow-context-menu__node-copy">
        <span className="workflow-context-menu__node-label">{nodeDef.label}</span>
        <span className="workflow-context-menu__node-meta">
          {inputCount} 入 / {outputCount} 出
        </span>
      </span>
    </MenuItem>
  );
}
