import { DialogFooter, DialogHeader } from '@/ui/DialogPrimitives';
import { Button } from '@/ui/FormPrimitives';
import { ModalSurface } from '@/ui/ModalSurface';
import {
  isolateWorkflowModalKey,
  stopWorkflowModalEvent,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from './workflowModalIsolation';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type WorkflowConfirmTone = 'default' | 'danger';

export type WorkflowConfirmRequest = {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: WorkflowConfirmTone;
};

type PendingConfirmRequest = WorkflowConfirmRequest & {
  resolve: (confirmed: boolean) => void;
};

const WorkflowConfirmContext = createContext<((request: WorkflowConfirmRequest) => Promise<boolean>) | null>(null);

export function WorkflowConfirmProvider({
  children,
  theme,
}: { children: ReactNode; theme?: 'dark' | 'light' }) {
  const [pendingRequest, setPendingRequest] = useState<PendingConfirmRequest | null>(null);
  const pendingResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((request: WorkflowConfirmRequest) => {
    pendingResolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      pendingResolverRef.current = resolve;
      setPendingRequest({ ...request, resolve });
    });
  }, []);

  const close = useCallback(
    (confirmed: boolean) => {
      pendingRequest?.resolve(confirmed);
      pendingResolverRef.current = null;
      setPendingRequest(null);
    },
    [pendingRequest],
  );

  useEffect(() => {
    return () => {
      pendingResolverRef.current?.(false);
      pendingResolverRef.current = null;
    };
  }, []);

  const contextValue = useMemo(() => confirm, [confirm]);

  return (
    <WorkflowConfirmContext.Provider value={contextValue}>
      {children}
      {pendingRequest && <WorkflowConfirmDialog request={pendingRequest} onClose={close} theme={theme} />}
    </WorkflowConfirmContext.Provider>
  );
}

export function useWorkflowConfirm() {
  const confirm = useContext(WorkflowConfirmContext);
  if (!confirm) throw new Error('useWorkflowConfirm must be used inside WorkflowConfirmProvider');
  return confirm;
}

function WorkflowConfirmDialog({
  request,
  onClose,
  theme,
}: {
  request: WorkflowConfirmRequest;
  theme?: 'dark' | 'light';
  onClose: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useWorkflowModalIsolation(dialogRef);

  if (typeof document === 'undefined') return null;

  const tone = request.tone || 'default';

  return createPortal(
    <ModalSurface
      ariaLabel={request.title}
      rootClassName="workflow-confirm-modal"
      panelClassName={`workflow-confirm-modal__dialog workflow-confirm-modal__dialog--${tone}`}
      panelRef={dialogRef}
      onClose={() => onClose(false)}
      manageFocus={false}
      closeOnEscape={false}
      dialogOnPanel
      rootProps={{
        ...workflowModalPointerBoundary,
        'data-workflow-modal-overlay': '',
        ...(theme ? { 'data-theme': theme } : {}),
        onClick: stopWorkflowModalEvent,
        onMouseDown: (event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) onClose(false);
        },
      }}
      panelProps={{
        onKeyDown: (event) => {
          isolateWorkflowModalKey(event);
          if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onClose(false);
          }
        },
        onKeyUp: stopWorkflowModalEvent,
        onKeyPress: stopWorkflowModalEvent,
        onPaste: stopWorkflowModalEvent,
        onMouseDown: stopWorkflowModalEvent,
      }}
    >
      <DialogHeader className="workflow-confirm-modal__header" eyebrow="风险确认" title={request.title} />
      {request.message && <div className="workflow-confirm-modal__body">{request.message}</div>}
      <DialogFooter className="workflow-confirm-modal__footer">
        <Button small variant="secondary" onClick={() => onClose(false)}>{request.cancelText || '取消'}</Button>
        <Button small variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => onClose(true)}>
          {request.confirmText || '确认'}
        </Button>
      </DialogFooter>
    </ModalSurface>,
    document.body,
  );
}
