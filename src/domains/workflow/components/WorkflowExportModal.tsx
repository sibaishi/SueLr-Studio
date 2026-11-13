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
      panelClassName="workflow-import-modal__dialog glass"
      onClose={onClose}
      closeOnRootClick
      isolateKeyboard
    >
      <header className="workflow-import-modal__header">
        <h2 className="workflow-panel__title">导出工作流</h2>
      </header>
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
        {error && <p role="alert" className="workflow-import-modal__item">{error}</p>}
        {busy && <p role="status" className="workflow-import-modal__item">正在打包素材…</p>}
      </div>
      <footer className="workflow-import-modal__footer">
        <button type="button" className="workflow-import-modal__button" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="workflow-import-modal__button"
          disabled={busy}
          onClick={() => onDownload(false)}
        >
          仅导出 JSON
        </button>
        <button
          type="button"
          className="workflow-import-modal__button workflow-import-modal__button--primary"
          disabled={busy}
          onClick={() => onDownload(true)}
        >
          带素材导出 ZIP
        </button>
      </footer>
    </ModalSurface>
  );
}
