import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { LongTextEditorModal } from '@/domains/workflow/components/nodes/LongTextEditorModal';
import {
  isolateWorkflowModalKey,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from '@/domains/workflow/components/workflowModalIsolation';
import { ModalSurface } from '@/ui/ModalSurface';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';

export type AgentPreview = {
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';
  name: string;
  source: string;
};

export function AgentMediaPreview({ item, onClose }: { item: AgentPreview; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useWorkflowModalIsolation(dialogRef);

  if (item.kind === 'image')
    return <ImagePreviewModal src={item.source} alt={item.name} title={item.name} onClose={onClose} />;
  if (item.kind === 'text')
    return (
      <LongTextEditorModal
        title={item.name}
        value={item.source}
        readOnly
        onChange={() => undefined}
        onClose={onClose}
      />
    );

  return createPortal(
    <ModalSurface
      ariaLabel={item.name}
      onClose={onClose}
      rootClassName="settings-modal"
      panelClassName="settings-modal__panel agent-file-dialog"
      backdropClassName="settings-modal__backdrop"
      panelRef={dialogRef}
      manageFocus={false}
      closeOnEscape={false}
      dialogOnPanel
      rootProps={{ ...workflowModalPointerBoundary, 'data-workflow-modal-overlay': '' }}
      panelProps={{
        onKeyDown: (event) => {
          isolateWorkflowModalKey(event);
          if (event.key === 'Escape') onClose();
        },
      }}
    >
      <header>
        <h2>{item.name}</h2>
        <a href={item.source} download={item.name} aria-label="下载文件">
          <DownloadSimple size={20} />
        </a>
        <button type="button" onClick={onClose} aria-label="关闭预览">
          <X size={20} />
        </button>
      </header>
      <div className="agent-file-dialog__body">
        {item.kind === 'video' && (
          // biome-ignore lint/a11y/useMediaCaption: Local and generated videos may have no caption track.
          <video src={item.source} controls playsInline preload="metadata" />
        )}
        {item.kind === 'audio' && <audio src={item.source} controls preload="metadata" />}
        {item.kind === 'pdf' && <iframe title={item.name} src={item.source} />}
        {item.kind === 'file' && <p>此格式可下载后查看。</p>}
      </div>
    </ModalSurface>,
    document.body,
  );
}
