import { DialogFooter, DialogHeader } from '@/ui/DialogPrimitives';
import { StatusNotice } from '@/ui/FeedbackPrimitives';
import { Button } from '@/ui/FormPrimitives';
import { ModalSurface } from '@/ui/ModalSurface';

export default function WorkflowExportModal({
  references,
  busy,
  error,
  onClose,
  onDownload,
}: {
  references: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onDownload: (withMedia: boolean) => void;
}) {
  return (
    <ModalSurface
      ariaLabel="导出工作流"
      rootClassName="workflow-import-modal"
      panelClassName="workflow-import-modal__dialog"
      onClose={onClose}
      closeOnRootClick
      isolateKeyboard
    >
      <DialogHeader className="workflow-import-modal__header" title="导出工作流" />
      <div className="workflow-import-modal__body">
        <p className="workflow-import-modal__item">
          引用了 {references.length} 个本地文件。选择 ZIP 可将支持的媒体随工作流一起迁移。
        </p>
        <ul className="workflow-import-modal__list">
          {references.map((url) => (
            <li key={url} className="workflow-import-modal__item break-all">
              {decodeURIComponent(url.split('/').at(-1) || url)}
            </li>
          ))}
        </ul>
        {error && <StatusNotice tone="error" role="alert">{error}</StatusNotice>}
        {busy && <StatusNotice role="status">正在打包素材…</StatusNotice>}
      </div>
      <DialogFooter className="workflow-import-modal__footer">
        <Button small variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
        <Button small variant="secondary" disabled={busy} onClick={() => onDownload(false)}>仅导出 JSON</Button>
        <Button small disabled={busy} onClick={() => onDownload(true)}>带素材导出 ZIP</Button>
      </DialogFooter>
    </ModalSurface>
  );
}
