import { buildImportReportSections } from '@/domains/workflow/lib/importExport';
import type { WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';

interface WorkflowImportReportModalProps {
  fileName: string;
  report: WorkflowImportReport;
  onClose: () => void;
}

export default function WorkflowImportReportModal({ fileName, report, onClose }: WorkflowImportReportModalProps) {
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
            <div className="workflow-panel__desc">
              已打开为新的未保存标签页。保存时会创建新的工作流记录。
            </div>
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
