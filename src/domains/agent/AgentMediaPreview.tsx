import { DialogCloseButton, DialogHeader } from '@/ui/DialogPrimitives';
import { MediaPlayer } from '@/ui/MediaPlayer';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { LongTextEditorModal } from '@/domains/workflow/components/nodes/LongTextEditorModal';
import {
  isolateWorkflowModalKey,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from '@/domains/workflow/components/workflowModalIsolation';
import { ModalSurface } from '@/ui/ModalSurface';
import { DownloadSimple } from '@phosphor-icons/react';
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
      size="workspace"
      panelClassName="agent-file-dialog"
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
      <DialogHeader
        title={item.name}
        actions={
          <>
            <a href={item.source} download={item.name} aria-label="下载文件">
              <DownloadSimple size={20} />
            </a>
            <DialogCloseButton label="关闭预览" onClick={onClose} />
          </>
        }
      />
      <div className="agent-file-dialog__body">
        {item.kind === 'video' && <MediaPlayer kind="video" src={item.source} />}
        {item.kind === 'audio' && <MediaPlayer kind="audio" src={item.source} />}
        {item.kind === 'pdf' && <iframe title={item.name} src={item.source} />}
        {item.kind === 'file' && <p>此格式可下载后查看。</p>}
      </div>
    </ModalSurface>,
    document.body,
  );
}
