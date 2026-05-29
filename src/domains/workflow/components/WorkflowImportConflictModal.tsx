import { getImportModeDescription, getImportModeLabel } from '@/domains/workflow/lib/importExport';
import type { WorkflowImportError, WorkflowImportMode } from '@/domains/workflow/lib/persistenceTypes';
import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

interface WorkflowImportConflictModalProps {
  fileName: string;
  conflict: WorkflowImportError;
  retryModes: WorkflowImportMode[];
  onRetry: (mode: WorkflowImportMode) => Promise<void>;
  onClose: () => void;
}

export default function WorkflowImportConflictModal({
  fileName,
  conflict,
  retryModes,
  onRetry,
  onClose,
}: WorkflowImportConflictModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="workflow-import-modal" onClick={onClose}>
      <div className="workflow-import-modal__dialog glass" onClick={(event) => event.stopPropagation()}>
        <div className="workflow-import-modal__header">
          <div>
            <div className="workflow-panel__eyebrow">导入冲突</div>
            <div className="workflow-panel__title">{fileName || 'workflow.json'}</div>
            <div className="workflow-panel__desc">检测到同 ID 工作流。选择一种处理方式后再继续导入。</div>
          </div>
          <div className="workflow-import-modal__status workflow-import-modal__status--warning">
            <AlertTriangle size={14} />
            <span>需要处理冲突</span>
          </div>
        </div>

        <div className="workflow-import-modal__body">
          <section className="workflow-import-modal__section">
            <div className="workflow-results__section-title">冲突说明</div>
            <div className="workflow-import-modal__item">{conflict.message}</div>
            {conflict.details?.workflowId && (
              <div className="workflow-import-modal__meta-row">
                <span>冲突 ID</span>
                <strong>{conflict.details.workflowId}</strong>
              </div>
            )}
          </section>

          <section className="workflow-import-modal__actions">
            <div className="workflow-import-modal__actions-label">
              <GitBranch size={14} />
              <span>选择处理方式</span>
            </div>
            <div className="workflow-import-modal__actions-row">
              {retryModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="workflow-import-modal__mode-button"
                  onClick={() => void onRetry(mode)}
                >
                  <span>
                    <RefreshCw size={13} />
                    <strong>{getImportModeLabel(mode)}</strong>
                  </span>
                  <small>{getImportModeDescription(mode)}</small>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="workflow-import-modal__footer">
          <button type="button" className="workflow-import-modal__button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
