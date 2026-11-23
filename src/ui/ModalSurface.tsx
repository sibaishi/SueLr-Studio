import { containDialogTab } from './dialogKeyboard';
import {
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type HTMLAttributes,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

const openDialogs: HTMLDivElement[] = [];

interface ModalSurfaceProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  rootClassName?: string;
  size?: 'workspace';
  backdropClassName?: string;
  backdropLabel?: string;
  closeOnRootClick?: boolean;
  isolateKeyboard?: boolean;
  inactive?: boolean;
  rootProps?: HTMLAttributes<HTMLDivElement> & { [attribute: `data-${string}`]: string };
  panelProps?: HTMLAttributes<HTMLDivElement>;
  panelRef?: Ref<HTMLDivElement>;
  manageFocus?: boolean;
  closeOnEscape?: boolean;
  dialogOnPanel?: boolean;
}

export function ModalSurface({
  ariaLabel,
  children,
  onClose,
  panelClassName = '',
  rootClassName = '',
  size,
  backdropClassName = size === 'workspace' ? 'ui-workspace-dialog__backdrop' : undefined,
  backdropLabel = '关闭',
  closeOnRootClick = false,
  isolateKeyboard = false,
  inactive = false,
  rootProps,
  panelProps,
  panelRef: externalPanelRef,
  manageFocus = true,
  closeOnEscape = true,
  dialogOnPanel = false,
}: ModalSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const assignPanelRef = useCallback(
    (panel: HTMLDivElement | null) => {
      panelRef.current = panel;
      if (typeof externalPanelRef === 'function') {
        const cleanup = externalPanelRef(panel);
        if (cleanup)
          return () => {
            cleanup();
            panelRef.current = null;
          };
      } else if (externalPanelRef) {
        externalPanelRef.current = panel;
      }
    },
    [externalPanelRef],
  );

  useEffect(() => {
    if (!manageFocus) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [manageFocus]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    openDialogs.push(root);
    return () => {
      const index = openDialogs.indexOf(root);
      if (index >= 0) openDialogs.splice(index, 1);
    };
  }, []);

  useEffect(() => {
    if (inactive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || root !== openDialogs.at(-1) || event.defaultPrevented) return;
      if (isolateKeyboard && event.target instanceof Node && root.contains(event.target)) return;
      if (closeOnEscape && event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        onClose();
        return;
      }
      if (isolateKeyboard && panelRef.current) containDialogTab(event, panelRef.current);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, inactive, isolateKeyboard, onClose]);

  const handleRootClick = (event: MouseEvent<HTMLDivElement>) => {
    rootProps?.onClick?.(event);
    if (closeOnRootClick && event.target === event.currentTarget) onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isolateKeyboard || inactive) return;
    event.stopPropagation();
    if (closeOnEscape && event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
      return;
    }
    if (panelRef.current) containDialogTab(event, panelRef.current);
  };

  const dialogProps = { role: 'dialog', 'aria-modal': true, 'aria-label': ariaLabel } as const;

  return (
    <div
      {...rootProps}
      ref={rootRef}
      {...(!dialogOnPanel && dialogProps)}
      className={`${size === 'workspace' ? 'ui-workspace-dialog' : ''} ${rootClassName}`}
      inert={inactive}
      onClick={handleRootClick}
      onKeyDown={(event) => {
        rootProps?.onKeyDown?.(event);
        if (!event.isPropagationStopped()) handleKeyDown(event);
      }}
    >
      {backdropClassName && (
        <button
          type="button"
          tabIndex={-1}
          className={backdropClassName}
          aria-label={backdropLabel}
          onClick={onClose}
        />
      )}
      <div
        {...panelProps}
        {...(dialogOnPanel && dialogProps)}
        ref={assignPanelRef}
        className={`modal-surface ${size === 'workspace' ? 'ui-workspace-dialog__panel' : ''} ${panelClassName}`}
        tabIndex={-1}
        onClick={(event) => {
          panelProps?.onClick?.(event);
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
