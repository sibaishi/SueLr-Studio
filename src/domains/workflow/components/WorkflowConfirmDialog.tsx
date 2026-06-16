import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

export function WorkflowConfirmProvider({ children }: { children: ReactNode }) {
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
    if (!pendingRequest) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, pendingRequest]);

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
      {pendingRequest && <WorkflowConfirmDialog request={pendingRequest} onClose={close} />}
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
}: {
  request: WorkflowConfirmRequest;
  onClose: (confirmed: boolean) => void;
}) {
  if (typeof document === 'undefined') return null;

  const tone = request.tone || 'default';

  return createPortal(
    <div
      className="workflow-confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-confirm-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      <div
        className={`workflow-confirm-modal__dialog workflow-confirm-modal__dialog--${tone}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workflow-confirm-modal__header">
          <div className="min-w-0 flex-1">
            <div className="workflow-confirm-modal__eyebrow">风险确认</div>
            <div id="workflow-confirm-title" className="workflow-confirm-modal__title">
              {request.title}
            </div>
          </div>
        </div>

        {request.message && <div className="workflow-confirm-modal__body">{request.message}</div>}

        <div className="workflow-confirm-modal__footer">
          <button type="button" className="workflow-confirm-modal__button" onClick={() => onClose(false)} autoFocus>
            {request.cancelText || '取消'}
          </button>
          <button
            type="button"
            className={`workflow-confirm-modal__button workflow-confirm-modal__button--${tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={() => onClose(true)}
          >
            {request.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
