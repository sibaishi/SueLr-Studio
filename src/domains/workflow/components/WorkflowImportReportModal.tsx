import {
  buildImportReportSections,
  getImportModeDescription,
  getImportModeLabel,
} from '@/domains/workflow/lib/importExport';
import type { WorkflowImportMode, WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { AlertTriangle, CheckCircle2, GitBranch, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

interface WorkflowImportReportModalProps {
  fileName: string;
  report: WorkflowImportReport;
  retryModes: WorkflowImportMode[];
  onRetry: (mode: WorkflowImportMode) => Promise<void>;
  onClose: () => void;
}

export default function WorkflowImportReportModal({
  fileName,
  report,
  retryModes,
  onRetry,
  onClose,
}: WorkflowImportReportModalProps) {
  const sections = buildImportReportSections(report);
  const hasWarnings = report.warnings.length > 0 || report.rejectedFields.length > 0;

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
            <div className="workflow-panel__eyebrow">导入结果</div>
            <div className="workflow-panel__title">{fileName || 'workflow.json'}</div>
            <div className="workflow-panel__desc">导入已完成。下面列出版本迁移、提示和被忽略字段。</div>
          </div>
          <div
            className={`workflow-import-modal__status ${hasWarnings ? 'workflow-import-modal__status--warning' : 'workflow-import-modal__status--success'}`}
          >
            {hasWarnings ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{hasWarnings ? '已导入，含提示' : '导入成功'}</span>
          </div>
        </div>

        <div className="workflow-import-modal__body">
          {sections.map((section) => (
            <section key={section.title} className="workflow-import-modal__section">
              <div className="workflow-results__section-title">{section.title}</div>
              <div className="workflow-import-modal__list">
                {section.lines.map((line, index) => (
                  <div key={`${section.title}-${index}`} className="workflow-import-modal__item">
                    {line}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {retryModes.length > 0 && (
          <div className="workflow-import-modal__actions">
            <div className="workflow-import-modal__actions-label">
              <GitBranch size={14} />
              <span>用其他方式重新导入</span>
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
          </div>
        )}

        <div className="workflow-import-modal__footer">
          <button
            type="button"
            className="workflow-import-modal__button workflow-import-modal__button--primary"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
