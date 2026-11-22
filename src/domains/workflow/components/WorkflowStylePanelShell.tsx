import { MenuTrigger } from '@/ui/MenuPrimitives';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

export const STYLE_PANEL_MIN_HEIGHT = 152;
export const STYLE_PANEL_MAX_HEIGHT = 300;

export function WorkflowStylePanelShell({
  children,
  initialHeight = STYLE_PANEL_MIN_HEIGHT,
}: {
  children: ReactNode;
  initialHeight?: number;
}) {
  const [height, setHeight] = useState(initialHeight);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleDragStart = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragStartY.current = event.clientY;
      dragStartHeight.current = height;
      setDragging(true);
    },
    [height],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      setHeight(
        Math.min(
          STYLE_PANEL_MAX_HEIGHT,
          Math.max(STYLE_PANEL_MIN_HEIGHT, dragStartHeight.current + dragStartY.current - event.clientY),
        ),
      );
    };
    const stop = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [dragging]);

  return (
    <div className="workflow-style-panel-shell" style={{ height }}>
      <div data-style-panel-resize-handle onPointerDown={handleDragStart} />
      {children}
    </div>
  );
}

export function StylePanelPopoverButton({
  icon,
  label,
  valueHint,
  open,
  direction = 'up',
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  valueHint?: string;
  open: boolean;
  direction?: 'up' | 'down';
  onToggle: () => void;
  children: ReactNode;
}) {
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onToggle();
    };
    document.addEventListener('click', closeOutside, true);
    return () => document.removeEventListener('click', closeOutside, true);
  }, [open, onToggle]);
  return (
    <div
      ref={rootRef}
      className="workflow-panel-popover-root"
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return;
        event.stopPropagation();
        triggerRef.current?.focus();
        onToggle();
      }}
    >
      <MenuTrigger
        ref={triggerRef}
        icon={icon}
        label={label}
        valueHint={valueHint}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={onToggle}
        className="nodrag"
      />
      {open && (
        <div
          id={popoverId}
          className="nodrag nowheel menu-surface ui-menu-popover workflow-panel-popover"
          data-direction={direction}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="menu-group workflow-panel-popover-heading">
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </div>
          <div className="menu-group workflow-panel-popover-content">{children}</div>
        </div>
      )}
    </div>
  );
}
