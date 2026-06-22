import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react';

interface ModalSurfaceProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName: string;
  rootClassName: string;
  backdropClassName?: string;
  backdropLabel?: string;
  closeOnRootClick?: boolean;
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
}: ModalSurfaceProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const handleRootClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnRootClick && event.target === event.currentTarget) onClose();
  };

  return (
    <div className={rootClassName} role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={handleRootClick}>
      {backdropClassName && (
        <button type="button" className={backdropClassName} aria-label={backdropLabel} onClick={onClose} />
      )}
      <div ref={panelRef} className={panelClassName} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
