import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { NodeCanvasEditorModal } from '@/domains/workflow/components/NodeCanvasEditorModal';
import { ArrowLeftRight, Brush, Check, ChevronLeft, ChevronRight, Columns2, Copy, Download, Maximize2, X } from 'lucide-react';
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

  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(1);
  const [selectingSlot, setSelectingSlot] = useState<'A' | 'B'>('A');
  const [sliderPosition, setSliderPosition] = useState(50);

  const resizedSrcsRef = useRef<Record<number, string>>({});
  const compareViewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startPos: number }>({
    active: false,
    startX: 0,
    startPos: 50,
  });

  const activeImage = gallery[activeIndex] || gallery[0];
  const displaySrc = resizedSrcs[activeIndex] || activeImage.src;
  const canNavigate = gallery.length > 1 && !isCompareMode;
  const canEditImage = showEditActions && Boolean(onApplyResize);
  const canCompare = gallery.length >= 2;

  const compareSrcA = resizedSrcs[compareA] || gallery[compareA]?.src || '';
  const compareSrcB = resizedSrcs[compareB] || gallery[compareB]?.src || '';

  // Compute slider position from drag
  const updateSliderFromEvent = useCallback((clientX: number) => {
    const el = compareViewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  const handleSliderMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragRef.current = { active: true, startX: event.clientX, startPos: sliderPosition };
      updateSliderFromEvent(event.clientX);
    },
    [sliderPosition, updateSliderFromEvent],
  );

  const handleSliderTouchStart = useCallback(
    (event: React.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      dragRef.current = { active: true, startX: touch.clientX, startPos: sliderPosition };
      updateSliderFromEvent(touch.clientX);
    },
    [sliderPosition, updateSliderFromEvent],
  );

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragRef.current.active) return;
      updateSliderFromEvent(event.clientX);
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!dragRef.current.active) return;
      const touch = event.touches[0];
      if (touch) updateSliderFromEvent(touch.clientX);
    };
    const handleUp = () => {
      dragRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [updateSliderFromEvent]);

  const enterCompareMode = useCallback(() => {
    const a = activeIndex;
    const b = (activeIndex + 1) % gallery.length;
    setCompareA(a);
    setCompareB(b);
    setSelectingSlot('A');
    setSliderPosition(50);
    setIsCompareMode(true);
  }, [activeIndex, gallery.length]);

  const exitCompareMode = useCallback(() => {
    setIsCompareMode(false);
  }, []);

  const handleCompareSelect = useCallback(
    (index: number) => {
      if (selectingSlot === 'A') {
        setCompareA(index);
        setSelectingSlot('B');
      } else {
        setCompareB(index);
        setSelectingSlot('A');
      }
    },
    [selectingSlot],
  );

  const compareARef = useRef(compareA);
  const compareBRef = useRef(compareB);
  compareARef.current = compareA;
  compareBRef.current = compareB;

  const swapCompare = useCallback(() => {
    setCompareA(compareBRef.current);
    setCompareB(compareARef.current);
  }, []);

  useEffect(() => {
    setActiveIndex(resolvedInitialIndex);
  }, [resolvedInitialIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isCompareMode) {
          exitCompareMode();
          return;
        }
        onClose();
      }
      if (event.key === 'ArrowLeft' && canNavigate) {
        setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
      }
      if (event.key === 'ArrowRight' && canNavigate) {
        setActiveIndex((index) => (index + 1) % gallery.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, gallery.length, onClose, isCompareMode, exitCompareMode]);

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
    const copySrc = isCompareMode ? compareSrcA : displaySrc;
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        setCopyStatus('当前环境不支持复制图片');
        return;
      }

      const blob = await buildClipboardImageBlob(copySrc);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('已复制图片');
    } catch {
      setCopyStatus('复制图片失败');
    }
    window.setTimeout(() => setCopyStatus(''), 1600);
  };

  const handleSaveAs = () => {
    const saveSrc = isCompareMode ? compareSrcA : displaySrc;
    const saveName = isCompareMode
      ? gallery[compareA]?.name || imageNameFromUrl(compareSrcA)
      : activeImage.name || imageNameFromUrl(activeImage.src);
    const link = document.createElement('a');
    link.href = saveSrc;
    link.download = saveName || 'image';
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
          <ImageSizeLabel
            src={isCompareMode ? compareSrcA : displaySrc}
            className="workflow-image-preview-modal__size-badge"
          />
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

        {!isCompareMode && (
          <div className="workflow-image-preview-modal__actions">
            {children}
            {renderActions?.(activeImage, activeIndex)}

            {canCompare && (
              <ImagePreviewActionButton
                icon={<Columns2 size={14} />}
                label="对比"
                active={false}
                onClick={enterCompareMode}
              />
            )}

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
        )}

        {isCompareMode ? (
          <div style={{ flex: 1, width: '100%', minHeight: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div
              ref={compareViewportRef}
              className="node-image-compare__viewport"
              style={{ '--compare-position': `${sliderPosition}%`, '--node-card-field': 'rgba(255,255,255,0.06)', '--node-field-border': 'rgba(255,255,255,0.12)', '--node-color': '#FF9500', flex: 1 } as React.CSSProperties}
              onMouseDown={handleSliderMouseDown}
              onTouchStart={handleSliderTouchStart}
            >
              <img
                src={compareSrcA}
                alt="对比图 A"
                className="node-image-compare__image"
                draggable={false}
              />
              <div className="node-image-compare__pane node-image-compare__pane--right">
                <img
                  src={compareSrcB}
                  alt="对比图 B"
                  className="node-image-compare__image"
                  draggable={false}
                />
              </div>
              <div className="node-image-compare__divider" />
              <div className="node-image-compare__labels">
                <span>A</span>
                <span>B</span>
              </div>
            </div>

            {/* Compare thumbnail strip */}
            <div className="workflow-image-preview-modal__compare-strip">
              <div className="workflow-image-preview-modal__compare-controls">
                <button
                  type="button"
                  className={`workflow-image-preview-modal__slot-toggle ${selectingSlot === 'A' ? 'is-active' : ''}`}
                  onClick={() => setSelectingSlot('A')}
                >
                  选A
                </button>
                <button
                  type="button"
                  className={`workflow-image-preview-modal__slot-toggle ${selectingSlot === 'B' ? 'is-active' : ''}`}
                  onClick={() => setSelectingSlot('B')}
                >
                  选B
                </button>
                <button
                  type="button"
                  className="workflow-image-preview-modal__swap-btn"
                  onClick={swapCompare}
                  title="交换A/B"
                >
                  <ArrowLeftRight size={12} />
                </button>
              </div>
              <div className="workflow-image-preview-modal__thumb-strip">
                {gallery.map((item, idx) => {
                  const isA = idx === compareA;
                  const isB = idx === compareB;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`workflow-image-preview-modal__thumb ${isA ? 'is-compare-a' : ''} ${isB ? 'is-compare-b' : ''}`}
                      onClick={() => handleCompareSelect(idx)}
                    >
                      <img src={item.src} alt="" draggable={false} />
                      {isA && <span className="workflow-image-preview-modal__thumb-badge">A</span>}
                      {isB && <span className="workflow-image-preview-modal__thumb-badge">B</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <img src={displaySrc} alt={alt} className="workflow-image-preview-modal__image" draggable={false} />
        )}

        {canvasEditorOpen && canEditImage && !isCompareMode && (
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
