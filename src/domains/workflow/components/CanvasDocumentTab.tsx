import { X } from '@phosphor-icons/react';

interface CanvasDocumentTabProps {
  documentId: string;
  name: string;
  active: boolean;
  isExecuting?: boolean;
  hasUnsavedChanges?: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function CanvasDocumentTab({
  documentId,
  name,
  active,
  isExecuting,
  hasUnsavedChanges,
  onSelect,
  onClose,
}: CanvasDocumentTabProps) {
  const label = name || '未命名工作流';
  return (
    <div className={`workflow-document-tab ${active ? 'workflow-document-tab--active' : ''}`}>
      <button
        type="button"
        className="workflow-document-tab__select"
        title={label}
        aria-current={active ? 'page' : undefined}
        aria-label={`${label}${hasUnsavedChanges ? '，未保存' : ''}${isExecuting ? '，运行中' : ''}`}
        data-testid={`workflow-document-tab-${documentId}`}
        onClick={() => onSelect(documentId)}
      >
        {isExecuting && <span className="workflow-document-tab__run-dot" aria-hidden="true" />}
        <span className="workflow-document-tab__label">
          {label}
          {hasUnsavedChanges ? ' *' : ''}
        </span>
      </button>
      <button
        type="button"
        className="workflow-document-tab__close"
        aria-label={`关闭标签：${label}`}
        title="关闭标签"
        onClick={() => onClose(documentId)}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
