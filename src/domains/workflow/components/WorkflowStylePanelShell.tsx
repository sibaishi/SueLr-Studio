import { CaretDown } from '@phosphor-icons/react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

export const STYLE_PANEL_MIN_HEIGHT = 150;
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
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 640,
        width: 'calc(100% - 44px)',
        height,
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        gap: 10,
        borderRadius: 25,
        background: 'var(--t-card)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--t-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 30,
        cursor: 'default',
      }}
    >
      <div
        data-style-panel-resize-handle
        onPointerDown={handleDragStart}
        style={{
          position: 'absolute',
          top: 0,
          left: 20,
          right: 20,
          height: 12,
          cursor: 'ns-resize',
        }}
      />
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
  showValue = false,
}: {
  icon: ReactNode;
  showValue?: boolean;
  label: string;
  valueHint?: string;
  open: boolean;
  direction?: 'up' | 'down';
  onToggle: () => void;
  children: ReactNode;
}) {
  const displayValue = valueHint || label;
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !showValue) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onToggle();
    };
    document.addEventListener('click', closeOutside, true);
    return () => document.removeEventListener('click', closeOutside, true);
  }, [open, showValue, onToggle]);
  return (
    <div
      ref={rootRef}
      className={showValue ? 'ai-parameter' : undefined}
      style={showValue ? undefined : { position: 'relative' }}
      onKeyDown={(event) => {
        if (!showValue || !open || event.key !== 'Escape') return;
        event.stopPropagation();
        triggerRef.current?.focus();
        onToggle();
      }}
    >
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        type="button"
        onClick={onToggle}
        className={showValue ? 'nodrag ai-parameter-trigger' : 'nodrag'}
        style={
          showValue
            ? undefined
            : {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 8px 0 6px',
                borderRadius: 9,
                border: open
                  ? '1px solid color-mix(in srgb, var(--t-border) 80%, transparent)'
                  : '1px solid color-mix(in srgb, var(--t-border) 50%, transparent)',
                background: open
                  ? 'color-mix(in srgb, var(--t-bg2) 72%, transparent)'
                  : 'color-mix(in srgb, var(--t-bg2) 55%, transparent)',
                backdropFilter: open ? 'blur(14px)' : 'blur(8px)',
                color: open ? 'var(--t-text)' : 'var(--t-text2)',
                fontSize: 11,
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease',
                boxShadow: open ? '0 2px 12px rgba(0,0,0,0.08)' : 'none',
              }
        }
        title={showValue ? `${label} · ${displayValue}` : label}
      >
        {showValue ? (
          <>
            <span className="ai-parameter-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="ai-parameter-caption">
              <span className="sr-only">{label}</span>
              <strong>{displayValue}</strong>
            </span>
            <CaretDown size={11} className="ai-parameter-chevron" aria-hidden="true" />
          </>
        ) : (
          <>
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.75 }}>{icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 64 }}>{displayValue}</span>
            <span
              style={{
                fontSize: 8,
                opacity: 0.45,
                flexShrink: 0,
                marginLeft: 1,
                transition: 'transform 0.2s',
                transform: open ? 'rotate(180deg)' : '',
              }}
            >
              ▾
            </span>
          </>
        )}
      </button>
      {open && (
        <>
          {!showValue && <div style={{ position: 'fixed', inset: 0, zIndex: 31 }} onClick={onToggle} />}
          <div
            id={popoverId}
            className={showValue ? 'nodrag nowheel ai-parameter-popover' : 'nodrag'}
            onPointerDown={(event) => event.stopPropagation()}
            style={
              showValue
                ? undefined
                : {
                    position: 'absolute',
                    ...(direction === 'up' ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 8 }),
                    right: 0,
                    minWidth: 260,
                    borderRadius: 16,
                    background: 'color-mix(in srgb, var(--t-card) 94%, transparent)',
                    backdropFilter: 'blur(48px) saturate(180%)',
                    border: '1px solid color-mix(in srgb, var(--t-border) 72%, transparent)',
                    boxShadow:
                      direction === 'up'
                        ? '0 -12px 48px rgba(0,0,0,0.14), 0 -1px 0 rgba(255,255,255,0.07) inset'
                        : '0 16px 48px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.07) inset',
                    zIndex: 32,
                  }
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '13px 16px 10px',
                borderBottom: '1px solid color-mix(in srgb, var(--t-border) 28%, transparent)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--t-text2)', opacity: 0.75 }}>
                {icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', fontFamily: 'var(--font-sans)' }}>
                {label}
              </span>
            </div>
            <div style={{ padding: 12 }}>{children}</div>
          </div>
        </>
      )}
    </div>
  );
}
