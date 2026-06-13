import type { WorkflowDocument } from '@/domains/workflow/lib/store';
import { X } from 'lucide-react';

interface DocumentTabsProps {
  documents: WorkflowDocument[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
}

export default function DocumentTabs({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
}: DocumentTabsProps) {
  if (documents.length <= 1) return null;

  return (
    <div className="workflow-document-tabs-shell glass" data-testid="workflow-document-tabs">
      <div className="workflow-document-tabs">
        {documents.map((document) => (
          <button
            key={document.documentId}
            type="button"
            className={`workflow-document-tab ${document.documentId === activeDocumentId ? 'workflow-document-tab--active' : ''}`}
            onClick={() => onSelectDocument(document.documentId)}
            data-testid={`workflow-document-tab-${document.documentId}`}
            title={document.name}
          >
            {document.isExecuting && <span className="workflow-document-tab__run-dot" title="运行中" />}
            <span className="workflow-document-tab__label">
              {document.name || '未命名工作流'}
              {document.hasUnsavedChanges ? ' *' : ''}
            </span>
            <span
              role="button"
              tabIndex={0}
              className="workflow-document-tab__close"
              aria-label="关闭标签"
              title="关闭标签"
              onClick={(event) => {
                event.stopPropagation();
                onCloseDocument(document.documentId);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onCloseDocument(document.documentId);
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
