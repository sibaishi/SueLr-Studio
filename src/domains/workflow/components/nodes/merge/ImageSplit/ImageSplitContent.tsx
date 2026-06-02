import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { NodeParamFields } from '../../NodeParamFields';
import type { NodeDef } from '../../nodeContentTypes';

export interface ImageSplitPreviewItem {
  id: string;
  src: string;
}

function normalizeGridDimension(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(1, Math.min(3, numeric)) : 3;
}

export function getImageSplitGridSize(data: Record<string, unknown>) {
  return {
    rows: normalizeGridDimension(data.rows),
    columns: normalizeGridDimension(data.columns),
  };
}

export function buildImageSplitPreviewItems(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  const { rows, columns } = getImageSplitGridSize(data);
  return Array.from({ length: rows * columns }, (_, index) => {
    const value = outputs?.[`part${index + 1}`];
    return {
      id: `part${index + 1}`,
      src: typeof value === 'string' ? value : '',
    };
  });
}

export function ImageSplitContent({
  params,
  nodeType,
  nodeId,
  data,
  outputs,
  outerStyle,
  onChange,
  onPatch,
}: {
  params: NonNullable<NodeDef>['params'];
  nodeType: string;
  nodeId?: string;
  data: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const gridSize = getImageSplitGridSize(data);
  const previewItems = buildImageSplitPreviewItems(data, outputs);
  const hasRuntimeOutput = previewItems.some((item) => item.src);

  return (
    <div
      className="node-content-shell node-settings-content node-settings-content--with-preview"
      style={{ ...outerStyle, overflow: 'auto' }}
    >
      <div className="node-settings-content__inner">
        <NodeParamFields
          params={params}
          nodeType={nodeType}
          nodeId={nodeId}
          values={data}
          onChange={onChange}
          onPatch={onPatch}
        />
        <div className="node-result-preview">
          <div className="node-result-preview__header">
            <span>拆分预览</span>
            <span>{hasRuntimeOutput ? '最近执行结果' : `${gridSize.rows} x ${gridSize.columns} 网格`}</span>
          </div>
          <button type="button" className="node-result-preview__open" onClick={() => setPreviewOpen(true)}>
            拆分预览
          </button>
        </div>
      </div>
      {previewOpen && (
        <ImageSplitPreviewModal
          rows={gridSize.rows}
          columns={gridSize.columns}
          images={previewItems}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function ImageSplitPreviewModal({
  rows,
  columns,
  images,
  onClose,
}: {
  rows: number;
  columns: number;
  images: ImageSplitPreviewItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="image-split-preview-modal" onClick={onClose}>
      <div className="image-split-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
        <div className="image-split-preview-modal__header">
          <div>
            <div className="image-split-preview-modal__title">查看拆分预览</div>
            <div className="image-split-preview-modal__meta">
              {rows} 行 x {columns} 列，共 {rows * columns} 块
            </div>
          </div>
          <button type="button" className="image-split-preview-modal__close" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="image-split-preview-modal__viewport">
          <div
            className="image-split-preview-modal__grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {images.map((image, index) => (
              <div key={image.id} className="image-split-preview-modal__cell">
                {image.src ? (
                  <img src={image.src} alt={`拆分图片 ${index + 1}`} draggable={false} />
                ) : (
                  <span>图片 {index + 1}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
