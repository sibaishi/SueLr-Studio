import { type MouseEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef } from 'react';

interface ModalSurfaceProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName: string;
  rootClassName: string;
  backdropClassName?: string;
  backdropLabel?: string;
  closeOnRootClick?: boolean;
  isolateKeyboard?: boolean;
  inactive?: boolean;
}

export function ModalSurface({
  ariaLabel,
  children,
  onClose,
  panelClassName,
  rootClassName,
  backdropClassName,
  backdropLabel = '关闭',
  closeOnRootClick = false,
  isolateKeyboard = false,
  inactive = false,
}: ModalSurfaceProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [onClose]);

  useEffect(() => {
    if (inactive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inactive, onClose]);

  const handleRootClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnRootClick && event.target === event.currentTarget) onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isolateKeyboard) return;
    event.stopPropagation();
    if (event.key === 'Escape') onClose();
    if (event.key !== 'Tab') return;
    const elements = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), a[href], video[controls], audio[controls], [tabindex="0"]',
      ) || [],
    ).filter((element) => element.getClientRects().length > 0);
    const first = elements[0];
    const last = elements.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={rootClassName}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      inert={inactive}
      onClick={handleRootClick}
      onKeyDown={handleKeyDown}
    >
      {backdropClassName && (
        <button type="button" className={backdropClassName} aria-label={backdropLabel} onClick={onClose} />
      )}
      <div ref={panelRef} className={panelClassName} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
