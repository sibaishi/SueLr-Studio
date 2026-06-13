import { APP_VERSION } from '@/domains/workflow/lib/constants';
import type { WorkflowDocument } from '@/domains/workflow/lib/store';
import { X } from 'lucide-react';

interface StatusBarProps {
  documents: WorkflowDocument[];
  activeDocumentId: string;
  nodeCount: number;
  edgeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
}

export default function StatusBar({
  documents,
  activeDocumentId,
  nodeCount,
  edgeCount,
  canUndo,
  canRedo,
  onSelectDocument,
  onCloseDocument,
}: StatusBarProps) {
  return (
    <div className="workflow-statusbar">
      <div className="workflow-statusbar__frame glass">
        <div className="workflow-document-tabs" data-testid="workflow-document-tabs">
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

        <div className="workflow-statusbar__items">
          <StatusPill label="节点" value={String(nodeCount)} testId="workflow-node-count" />
          <StatusPill label="连线" value={String(edgeCount)} />
          <StatusPill label="撤销" value={canUndo ? '可用' : '不可用'} />
          <StatusPill label="重做" value={canRedo ? '可用' : '不可用'} />
        </div>

        <div className="workflow-statusbar__version">
          <span className="workflow-statusbar__version-pill">SueLr Studio v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="workflow-statusbar__pill" data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
