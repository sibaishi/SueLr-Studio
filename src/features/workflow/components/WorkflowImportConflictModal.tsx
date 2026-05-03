import { useEffect } from 'react';
import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react';
import { getImportModeLabel } from '@/domains/workflow/import-export';
import type { WorkflowImportError, WorkflowImportMode } from '@/domains/workflow/types';

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
            <div className="workflow-panel__desc">检测到工作流 ID 冲突，请选择导入策略继续。</div>
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
              <div className="workflow-import-modal__item">冲突工作流 ID: {conflict.details.workflowId}</div>
            )}
          </section>

          <section className="workflow-import-modal__actions">
            <div className="workflow-import-modal__actions-label">
              <GitBranch size={14} />
              <span>继续导入</span>
            </div>
            <div className="workflow-import-modal__actions-row">
              {retryModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="workflow-import-modal__button"
                  onClick={() => void onRetry(mode)}
                >
                  <RefreshCw size={13} />
                  {getImportModeLabel(mode)}
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
