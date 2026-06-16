import { APP_VERSION } from '@/domains/workflow/lib/constants';
import type { WorkflowDocument } from '@/domains/workflow/lib/store';
import { Copy, Download, Plus, Redo2, Save, Trash2, Undo2, Upload, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatusBarProps {
  documents: WorkflowDocument[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onNewWorkflow: () => void;
  onDuplicateWorkflow: () => void;
  onDeleteWorkflow: () => void;
  onImportWorkflow: () => void;
  onExportWorkflow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
}

export default function StatusBar({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
  onNewWorkflow,
  onDuplicateWorkflow,
  onDeleteWorkflow,
  onImportWorkflow,
  onExportWorkflow,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  isSavingWorkflow,
  hasUnsavedChanges,
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

        <div className="workflow-statusbar__actions">
          <StatusbarIconButton
            icon={<Undo2 size={15} />}
            label="撤销"
            onClick={onUndo}
            disabled={!canUndo}
          />
          <StatusbarIconButton
            icon={<Redo2 size={15} />}
            label="重做"
            onClick={onRedo}
            disabled={!canRedo}
          />
          <span className="workflow-statusbar__sep" />
          <StatusbarIconButton
            icon={<Upload size={15} />}
            label="导入"
            onClick={onImportWorkflow}
            testId="workflow-import"
          />
          <StatusbarIconButton
            icon={<Download size={15} />}
            label="导出"
            onClick={onExportWorkflow}
            testId="workflow-export"
          />
          <span className="workflow-statusbar__sep" />
          <StatusbarIconButton icon={<Plus size={15} />} label="新建" onClick={onNewWorkflow} testId="workflow-new" />
          <StatusbarIconButton
            icon={<Copy size={15} />}
            label="另存为副本"
            onClick={onDuplicateWorkflow}
            testId="workflow-duplicate"
          />
          <StatusbarIconButton
            icon={<Trash2 size={15} />}
            label="删除"
            onClick={onDeleteWorkflow}
            testId="workflow-delete"
          />
          <StatusbarIconButton
            icon={<Save size={15} />}
            label="保存"
            onClick={onSave}
            disabled={isSavingWorkflow}
            active={hasUnsavedChanges}
            testId="workflow-save"
          />
        </div>

        <div className="workflow-statusbar__version">
          <span className="workflow-statusbar__version-pill">SueLr Studio v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}

function StatusbarIconButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
  testId,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="workflow-toolbar__icon-button"
      style={{
        opacity: disabled ? 0.45 : 1,
        color: active
          ? 'var(--color-accent)'
          : disabled
            ? 'var(--color-text-quaternary)'
            : 'var(--color-text-secondary)',
        background: active ? 'rgba(10,132,255,0.12)' : 'transparent',
      }}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
