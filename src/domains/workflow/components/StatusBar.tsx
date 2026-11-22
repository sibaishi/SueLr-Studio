import { APP_VERSION } from '@/domains/workflow/lib/constants';
import type { WorkflowDocument } from '@/domains/workflow/lib/store';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Copy,
  Download,
  FloppyDisk,
  Plus,
  Trash,
  Upload,
} from '@phosphor-icons/react';
import { FloatingSurface, IconButton as StatusbarIconButton } from '@/ui/CanvasPrimitives';
import CanvasDocumentTab from './CanvasDocumentTab';

interface StatusBarProps {
  documents: Pick<WorkflowDocument, 'documentId' | 'name' | 'hasUnsavedChanges' | 'isExecuting'>[];
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
      <FloatingSurface className="workflow-statusbar__frame">
        <div className="workflow-document-tabs" data-testid="workflow-document-tabs">
          {documents.map((document) => (
            <CanvasDocumentTab
              key={document.documentId}
              {...document}
              active={document.documentId === activeDocumentId}
              onSelect={onSelectDocument}
              onClose={onCloseDocument}
            />
          ))}
        </div>

        <div className="workflow-statusbar__actions">
          <StatusbarIconButton
            icon={<ArrowCounterClockwise size={15} />}
            label="撤销"
            onClick={onUndo}
            disabled={!canUndo}
          />
          <StatusbarIconButton icon={<ArrowClockwise size={15} />} label="重做" onClick={onRedo} disabled={!canRedo} />
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
            icon={<Trash size={15} />}
            label="删除"
            onClick={onDeleteWorkflow}
            testId="workflow-delete"
          />
          <StatusbarIconButton
            icon={<FloppyDisk size={15} />}
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
      </FloatingSurface>
    </div>
  );
}
