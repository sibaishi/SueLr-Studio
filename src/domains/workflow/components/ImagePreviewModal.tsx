import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { NodeCanvasEditorModal } from '@/domains/workflow/components/NodeCanvasEditorModal';
import { Brush, Check, ChevronLeft, ChevronRight, Copy, Download, Maximize2, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PreviewImageItem {
  src: string;
  thumbnailSrc?: string;
  name?: string;
}

export function ImagePreviewModal({
  src,
  alt = '查看大图',
  closeLabel = '关闭',
  images,
  initialIndex,
  onClose,
  onApplyResize,
  showEditActions = false,
  renderActions,
  children,
}: {
  src: string;
  alt?: string;
  closeLabel?: string;
  images?: PreviewImageItem[];
  initialIndex?: number;
  onClose: () => void;
  onApplyResize?: (
    resizedBlobUrl: string,
    w: number,
    h: number,
    blob?: Blob,
    activeItem?: PreviewImageItem,
    activeIndex?: number,
  ) => void;
  showEditActions?: boolean;
  renderActions?: (activeItem: PreviewImageItem, activeIndex: number) => ReactNode;
  children?: ReactNode;
}) {
  const gallery = useMemo(() => {
    const normalized = (images && images.length > 0 ? images : [{ src }])
      .filter((item) => item.src)
      .map((item) => ({ src: item.src, name: item.name || imageNameFromUrl(item.src) }));
    return normalized.length > 0 ? normalized : [{ src, name: imageNameFromUrl(src) }];
  }, [images, src]);

  const resolvedInitialIndex =
    typeof initialIndex === 'number' && initialIndex >= 0 && initialIndex < gallery.length
      ? initialIndex
      : Math.max(
          0,
          gallery.findIndex((item) => item.src === src),
        );

  const [activeIndex, setActiveIndex] = useState(resolvedInitialIndex);
  const [copyStatus, setCopyStatus] = useState('');
  const [showResize, setShowResize] = useState(false);
  const [resizeMode, setResizeMode] = useState<'percent' | 'dimensions'>('percent');
  const [scalePercent, setScalePercent] = useState(100);
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [resizedSrcs, setResizedSrcs] = useState<Record<number, string>>({});
  const [canvasEditorOpen, setCanvasEditorOpen] = useState(false);
  const resizedSrcsRef = useRef<Record<number, string>>({});

  const activeImage = gallery[activeIndex] || gallery[0];
  const displaySrc = resizedSrcs[activeIndex] || activeImage.src;
  const canNavigate = gallery.length > 1;
  const canEditImage = showEditActions && Boolean(onApplyResize);

  useEffect(() => {
    setActiveIndex(resolvedInitialIndex);
  }, [resolvedInitialIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && canNavigate) {
        setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
      }
      if (event.key === 'ArrowRight' && canNavigate) {
        setActiveIndex((index) => (index + 1) % gallery.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, gallery.length, onClose]);

  useEffect(() => {
    resizedSrcsRef.current = resizedSrcs;
  }, [resizedSrcs]);

  useEffect(() => {
    return () => {
      Object.values(resizedSrcsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const goPrevious = () => setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
  const goNext = () => setActiveIndex((index) => (index + 1) % gallery.length);

  const handleCopyImage = async () => {
    setCopyStatus('');
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        setCopyStatus('当前环境不支持复制图片');
        return;
      }

      const blob = await buildClipboardImageBlob(displaySrc);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('已复制图片');
    } catch {
      setCopyStatus('复制图片失败');
    }
    window.setTimeout(() => setCopyStatus(''), 1600);
  };

  const handleSaveAs = () => {
    const link = document.createElement('a');
    link.href = displaySrc;
    link.download = activeImage.name || imageNameFromUrl(activeImage.src) || 'image';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const publishEditedBlob = useCallback(
    (url: string, width: number, height: number, blob: Blob) => {
      setResizedSrcs((prev) => {
        const next = { ...prev, [activeIndex]: url };
        if (prev[activeIndex]) URL.revokeObjectURL(prev[activeIndex]);
        return next;
      });
      onApplyResize?.(url, width, height, blob, activeImage, activeIndex);
    },
    [activeImage, activeIndex, onApplyResize],
  );

  const handleApplyResize = useCallback(async () => {
    try {
      const img = await loadImageElement(displaySrc);
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      let w: number;
      let h: number;
      if (resizeMode === 'percent') {
        const pct = Math.max(1, Math.min(1000, scalePercent)) / 100;
        w = Math.round(origW * pct);
        h = Math.round(origH * pct);
      } else {
        w = targetWidth || Math.round(origW * (targetHeight / origH));
        h = targetHeight || Math.round(origH * (targetWidth / origW));
        w = w || origW;
        h = h || origH;
      }

      const blob = await drawImageToPng(img, w, h);
      const url = URL.createObjectURL(blob);
      publishEditedBlob(url, w, h, blob);
    } catch {
      // Keep the viewer open; callers already treat resizing as optional.
    }
  }, [displaySrc, publishEditedBlob, resizeMode, scalePercent, targetHeight, targetWidth]);

  const handleCanvasSave = useCallback(
    async (file: File, previewUrl: string) => {
      const img = await loadImageElement(previewUrl);
      publishEditedBlob(previewUrl, img.naturalWidth || img.width, img.naturalHeight || img.height, file);
      setCanvasEditorOpen(false);
    },
    [publishEditedBlob],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="workflow-image-preview-modal" onClick={onClose}>
      <div className="workflow-image-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
        <div className="workflow-image-preview-modal__topbar">
          <ImageSizeLabel src={displaySrc} className="workflow-image-preview-modal__size-badge" />
          <button
            type="button"
            onClick={onClose}
            className="workflow-image-preview-modal__icon-button"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={16} />
          </button>
        </div>

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="workflow-image-preview-modal__nav workflow-image-preview-modal__nav--prev"
              aria-label="上一张"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="workflow-image-preview-modal__nav workflow-image-preview-modal__nav--next"
              aria-label="下一张"
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}

        <div className="workflow-image-preview-modal__actions">
          {children}
          {renderActions?.(activeImage, activeIndex)}
          {showResize && canEditImage && (
            <div className="workflow-image-preview-modal__resize-panel">
              <select
                value={resizeMode}
                onChange={(event) => setResizeMode(event.target.value as 'percent' | 'dimensions')}
                className="workflow-image-preview-modal__field"
              >
                <option value="percent">百分比</option>
                <option value="dimensions">按尺寸</option>
              </select>
              {resizeMode === 'percent' ? (
                <>
                  <input
                    type="number"
                    value={scalePercent}
                    min={1}
                    max={1000}
                    onChange={(event) =>
                      setScalePercent(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))
                    }
                    className="workflow-image-preview-modal__field workflow-image-preview-modal__field--number"
                  />
                  <span className="workflow-image-preview-modal__muted">%</span>
                </>
              ) : (
                <>
                  <input
                    type="number"
                    value={targetWidth || ''}
                    min={1}
                    onChange={(event) => setTargetWidth(Math.max(1, Number(event.target.value) || 0))}
                    className="workflow-image-preview-modal__field workflow-image-preview-modal__field--number"
                    placeholder="宽"
                  />
                  <span className="workflow-image-preview-modal__muted">x</span>
                  <input
                    type="number"
                    value={targetHeight || ''}
                    min={1}
                    onChange={(event) => setTargetHeight(Math.max(1, Number(event.target.value) || 0))}
                    className="workflow-image-preview-modal__field workflow-image-preview-modal__field--number"
                    placeholder="高"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  void handleApplyResize();
                }}
                className="workflow-image-preview-modal__apply"
              >
                <Check size={13} />
                应用
              </button>
            </div>
          )}
          {copyStatus && <span className="workflow-image-preview-modal__status">{copyStatus}</span>}
          {canEditImage && (
            <>
              <ImagePreviewActionButton
                icon={<Maximize2 size={14} />}
                label="缩放"
                active={showResize}
                onClick={() => setShowResize((prev) => !prev)}
              />
              <ImagePreviewActionButton
                icon={<Brush size={14} />}
                label="画板"
                onClick={() => setCanvasEditorOpen(true)}
              />
            </>
          )}
          <ImagePreviewActionButton
            icon={<Copy size={14} />}
            label="复制图片"
            onClick={() => {
              void handleCopyImage();
            }}
          />
          <ImagePreviewActionButton icon={<Download size={14} />} label="另存为" onClick={handleSaveAs} />
        </div>

        <img src={displaySrc} alt={alt} className="workflow-image-preview-modal__image" draggable={false} />

        {canvasEditorOpen && canEditImage && (
          <NodeCanvasEditorModal
            src={displaySrc}
            nodeLabel={activeImage.name || '画板'}
            onClose={() => setCanvasEditorOpen(false)}
            onSavePaint={handleCanvasSave}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ImagePreviewActionButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workflow-image-preview-modal__action ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
    >
      {icon}
      {label}
    </button>
  );
}

function imageNameFromUrl(src: string) {
  try {
    const url = new URL(src, window.location.href);
    const name = url.pathname.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : 'image';
  } catch {
    return 'image';
  }
}

async function buildClipboardImageBlob(src: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const sourceBlob = await response.blob();
    return await imageBlobToPng(sourceBlob);
  } catch {
    return await imageElementToPng(src);
  }
}

async function imageBlobToPng(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return await drawImageToPng(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function imageElementToPng(src: string) {
  const image = await loadImageElement(src);
  return drawImageToPng(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.crossOrigin = 'anonymous';
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('image load failed'));
    nextImage.src = src;
  });
}

function drawImageToPng(image: CanvasImageSource, width: number, height: number) {
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('canvas unavailable'));
      return;
    }

    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('png conversion failed'));
    }, 'image/png');
  });
}
