import { ModalSurface } from '@/ui/ModalSurface';
import {
  isolateWorkflowModalKey,
  stopWorkflowModalEvent,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from './workflowModalIsolation';
import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { NodeCanvasEditorModal } from '@/domains/workflow/components/NodeCanvasEditorModal';
import { loadWorkflowImage } from '@/domains/workflow/lib/browserImage';
import { CaretLeft, CaretRight, Columns, Copy, Download, Minus, PaintBrush, Plus, X } from '@phosphor-icons/react';
import { type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FIT_VIEW = { zoom: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface PreviewImageItem {
  src: string;
  thumbnailSrc?: string;
  name?: string;
}

export function ImagePreviewModal({
  src,
  textContent,
  onTextChange,
  title,
  renderTextActions,
  alt = '查看大图',
  closeLabel = '关闭',
  overlayClassName,
  images,
  initialIndex,
  onClose,
  onSaveBoardImage,
  onExportLayer,
  showEditActions = false,
  renderActions,
  children,
}: {
  src: string;
  textContent?: string;
  onTextChange?: (text: string) => void;
  title?: string;
  renderTextActions?: () => ReactNode;
  alt?: string;
  closeLabel?: string;
  overlayClassName?: string;
  images?: PreviewImageItem[];
  initialIndex?: number;
  onClose: () => void;
  onExportLayer?: (file: File) => Promise<void>;
  onSaveBoardImage?: (
    previewUrl: string,
    blob: File,
    activeItem?: PreviewImageItem,
    activeIndex?: number,
  ) => void | Promise<void>;
  showEditActions?: boolean;
  renderActions?: (activeItem: PreviewImageItem, activeIndex: number) => ReactNode;
  children?: ReactNode;
}) {
  const gallery = useMemo(() => {
    const normalized = (images && images.length > 0 ? images : [{ src }])
      .filter((item) => item.src)
      .map((item) => ({ ...item, name: item.name || imageNameFromUrl(item.src) }));
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
  const [textCopyStatus, setTextCopyStatus] = useState('');
  const [localText, setLocalText] = useState(textContent || '');

  // Sync localText from external textContent changes (from textarea below)
  useEffect(() => {
    if (textContent !== undefined && textContent !== localText) {
      setLocalText(textContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textContent]);

  const handleTextChange = useCallback(
    (value: string) => {
      setLocalText(value);
      onTextChange?.(value);
    },
    [onTextChange],
  );
  const [resizedSrcs, setResizedSrcs] = useState<Record<number, string>>({});
  const [canvasEditorOpen, setCanvasEditorOpen] = useState(false);

  const [comparePair, setComparePair] = useState<[number, number] | null>(null);
  const [compareLayout, setCompareLayout] = useState<'slider' | 'side-by-side'>('slider');
  const [selectingSlot, setSelectingSlot] = useState<0 | 1>(1);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [view, setView] = useState(FIT_VIEW);

  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ pointerId: number; kind: 'slide' | 'pan'; x: number; y: number } | null>(null);

  useWorkflowModalIsolation(dialogRef);

  const resizedSrcsRef = useRef<Record<number, string>>({});
  const isCompareMode = comparePair !== null && gallery.length >= 2;
  const compareA = comparePair && gallery[comparePair[0]] ? comparePair[0] : 0;
  const compareB = comparePair && gallery[comparePair[1]] && comparePair[1] !== compareA
    ? comparePair[1]
    : (compareA + 1) % gallery.length;

  const activeImage = gallery[activeIndex] || gallery[0];
  const displaySrc = resizedSrcs[activeIndex] || activeImage.src;
  const canNavigate = gallery.length > 1 && !isCompareMode;
  const canEditImage = showEditActions && Boolean(onSaveBoardImage);
  const canCompare = gallery.length >= 2;

  const compareSrcA = resizedSrcs[compareA] || gallery[compareA]?.src || '';
  const compareSrcB = resizedSrcs[compareB] || gallery[compareB]?.src || '';

  const isSlider = isCompareMode && compareLayout === 'slider';
  const paneCount = isCompareMode && compareLayout === 'side-by-side' ? 2 : 1;
  const isImagePreview = textContent == null;

  const changeZoom = useCallback((factor: number) => {
    setView((current) => {
      const zoom = clamp(current.zoom * factor, 1, MAX_ZOOM);
      if (zoom === 1) return FIT_VIEW;
      const limit = (zoom - 1) / 2;
      return { zoom, x: clamp(current.x, -limit, limit), y: clamp(current.y, -limit, limit) };
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !isImagePreview) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [changeZoom, isImagePreview]);

  const moveDivider = (clientX: number, rect: DOMRect) => {
    if (rect.width) setSliderPosition(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  };

  const startGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const onDivider = event.target instanceof Element && event.target.closest('[role="slider"]');
    const kind = isSlider && (onDivider || view.zoom === 1) ? 'slide' : 'pan';
    if (kind === 'pan' && view.zoom === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { pointerId: event.pointerId, kind, x: event.clientX, y: event.clientY };
    if (kind === 'slide' && !onDivider) {
      moveDivider(event.clientX, event.currentTarget.getBoundingClientRect());
    }
  };

  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (gesture.kind === 'slide') {
      moveDivider(event.clientX, rect);
      return;
    }
    if (!rect.width || !rect.height) return;
    const dx = ((event.clientX - gesture.x) * paneCount) / rect.width;
    const dy = (event.clientY - gesture.y) / rect.height;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    setView((current) => {
      const limit = (current.zoom - 1) / 2;
      return { ...current, x: clamp(current.x + dx, -limit, limit), y: clamp(current.y + dy, -limit, limit) };
    });
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
  };

  const enterCompareMode = () => {
    const a = gallery[activeIndex] ? activeIndex : 0;
    setComparePair([a, (a + 1) % gallery.length]);
    setSelectingSlot(1);
    setCompareLayout('slider');
    setSliderPosition(50);
    dialogRef.current?.focus();
  };

  const exitCompareMode = useCallback(() => {
    setComparePair(null);
    dialogRef.current?.focus();
  }, []);

  const handleCompareSelect = (index: number) => {
    const current = selectingSlot === 0 ? compareA : compareB;
    const other = selectingSlot === 0 ? compareB : compareA;
    if (index === current) return;
    if (index === other) {
      setComparePair([compareB, compareA]);
    } else {
      setComparePair(selectingSlot === 0 ? [index, compareB] : [compareA, index]);
    }
  };

  useEffect(() => {
    setActiveIndex(resolvedInitialIndex);
  }, [resolvedInitialIndex]);

  useEffect(() => {
    setView(FIT_VIEW);
  }, [displaySrc]);

  const handlePreviewKey = useCallback(
    (key: string) => {
      if (key === 'Escape') {
        if (isCompareMode) exitCompareMode();
        else onClose();
      }
      if (key === 'ArrowLeft' && canNavigate) {
        setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
      }
      if (key === 'ArrowRight' && canNavigate) {
        setActiveIndex((index) => (index + 1) % gallery.length);
      }
    },
    [canNavigate, gallery.length, onClose, isCompareMode, exitCompareMode],
  );

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
    link.download = activeImage.name || 'image';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const publishEditedBlob = useCallback(
    async (url: string, blob: File) => {
      await onSaveBoardImage?.(url, blob, activeImage, activeIndex);
      setResizedSrcs((prev) => {
        const next = { ...prev, [activeIndex]: url };
        if (prev[activeIndex]) URL.revokeObjectURL(prev[activeIndex]);
        return next;
      });
    },
    [activeImage, activeIndex, onSaveBoardImage],
  );

  const handleCanvasSave = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      try {
        await publishEditedBlob(previewUrl, file);
        setCanvasEditorOpen(false);
      } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
      }
    },
    [publishEditedBlob],
  );

  const handleCopyText = useCallback(async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setTextCopyStatus('已复制');
    } catch {
      setTextCopyStatus('复制失败');
    }
    setTimeout(() => setTextCopyStatus(''), 2000);
  }, [textContent]);

  const textStats = useMemo(() => {
    const t = localText || '';
    const chars = [...t].length;
    const lines = t ? t.split(/\n/).length : 0;
    const paragraphs = t ? t.split(/\n\n/).filter((p) => p.trim()).length : 0;
    return { chars, lines, paragraphs };
  }, [localText]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <ModalSurface
      ariaLabel={title || (textContent != null ? '查看文本' : alt)}
      onClose={onClose}
      rootClassName={['settings-modal', 'workflow-image-preview-modal', overlayClassName].filter(Boolean).join(' ')}
      panelClassName="settings-modal__panel workflow-image-preview-modal__dialog"
      backdropClassName="settings-modal__backdrop"
      panelRef={dialogRef}
      manageFocus={false}
      closeOnEscape={false}
      dialogOnPanel
      rootProps={{
        ...workflowModalPointerBoundary,
        'data-workflow-modal-overlay': '',
        onClick: stopWorkflowModalEvent,
        onMouseDown: stopWorkflowModalEvent,
      }}
      panelProps={{
        onKeyPress: stopWorkflowModalEvent,
        onPaste: stopWorkflowModalEvent,
        onKeyUp: stopWorkflowModalEvent,
        onKeyDown: (event) => {
          isolateWorkflowModalKey(event);
          if (canvasEditorOpen || event.defaultPrevented || event.nativeEvent.isComposing) return;
          const target = event.target;
          if (
            event.key !== 'Escape' &&
            target instanceof HTMLElement &&
            target.matches('input, textarea, select, [contenteditable="true"]')
          )
            return;
          if (event.key === 'Escape' || (canNavigate && ['ArrowLeft', 'ArrowRight'].includes(event.key))) {
            event.preventDefault();
            handlePreviewKey(event.key);
          }
        },
      }}
    >
      {textContent != null ? (
        <div className="workflow-image-preview-modal__text-viewer">
          <div className="workflow-image-preview-modal__text-card">
            <div className="workflow-image-preview-modal__text-toolbar">
              <span className="workflow-image-preview-modal__text-mode">{onTextChange ? '编辑中' : '文本'}</span>
              {title && <span className="workflow-image-preview-modal__text-title">{title}</span>}
              <span className="workflow-image-preview-modal__text-stats">
                {textStats.chars} 字符　{textStats.lines} 行　{textStats.paragraphs} 段
              </span>
              <div style={{ flex: 1, minWidth: 12 }} />
              {renderTextActions?.()}
              <button
                type="button"
                onClick={handleCopyText}
                className="workflow-image-preview-modal__icon-button"
                aria-label="复制文本"
                title={textCopyStatus || '复制文本'}
                disabled={!!textCopyStatus}
              >
                <Copy size={14} />
              </button>
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
            {onTextChange ? (
              <textarea
                className="workflow-image-preview-modal__text-editor"
                value={localText}
                onChange={(e) => handleTextChange(e.target.value)}
              />
            ) : (
              <pre className="workflow-image-preview-modal__text-content">{localText}</pre>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="workflow-image-preview-modal__topbar">
            {isCompareMode ? (
              <ImagePreviewActionButton label="退出对比" onClick={exitCompareMode} />
            ) : (
              <ImageSizeLabel src={displaySrc} className="workflow-image-preview-modal__size-badge" />
            )}
            <div className="workflow-image-preview-modal__zoom" role="group" aria-label="图片缩放">
              <ImagePreviewActionButton
                icon={<Minus size={14} />}
                label="缩小"
                iconOnly
                disabled={view.zoom === 1}
                onClick={() => changeZoom(1 / 1.25)}
              />
              <button
                type="button"
                className="workflow-image-preview-modal__action"
                aria-label={`适应窗口，当前缩放 ${Math.round(view.zoom * 100)}%`}
                title="适应窗口"
                onClick={() => setView(FIT_VIEW)}
              >
                {Math.round(view.zoom * 100)}%
              </button>
              <ImagePreviewActionButton
                icon={<Plus size={14} />}
                label="放大"
                iconOnly
                disabled={view.zoom === MAX_ZOOM}
                onClick={() => changeZoom(1.25)}
              />
            </div>
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
                <CaretLeft size={26} />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="workflow-image-preview-modal__nav workflow-image-preview-modal__nav--next"
                aria-label="下一张"
              >
                <CaretRight size={26} />
              </button>
            </>
          )}

          {!isCompareMode && (
            <div className="workflow-image-preview-modal__actions">
              {children}
              {renderActions?.(activeImage, activeIndex)}

              {canCompare && (
                <ImagePreviewActionButton
                  icon={<Columns size={14} />}
                  label="对比"
                  onClick={enterCompareMode}
                />
              )}

              {copyStatus && <span className="workflow-image-preview-modal__status">{copyStatus}</span>}
              {canEditImage && (
                <ImagePreviewActionButton
                  icon={<PaintBrush size={14} />}
                  label="画板"
                  onClick={() => setCanvasEditorOpen(true)}
                />
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

          <div className="workflow-image-preview-modal__viewer">
            <div
              ref={stageRef}
              className={`workflow-image-preview-modal__stage ${isSlider ? 'is-slider' : ''} ${paneCount === 2 ? 'is-side-by-side' : ''} ${view.zoom > 1 ? 'is-zoomed' : ''}`}
              style={{
                '--divider': `${sliderPosition}%`,
                '--image-transform': `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.zoom})`,
              } as CSSProperties}
              onPointerDown={startGesture}
              onPointerMove={moveGesture}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onLostPointerCapture={endGesture}
            >
              <div className={`workflow-image-preview-modal__pane ${isCompareMode ? 'is-a' : ''}`}>
                <img
                  src={isCompareMode ? compareSrcA : displaySrc}
                  alt={isCompareMode ? '对比图 A' : alt}
                  className="workflow-image-preview-modal__image"
                  draggable={false}
                />
                {isCompareMode && <span className="workflow-image-preview-modal__pane-label">A</span>}
              </div>
              {isCompareMode && (
                <div className="workflow-image-preview-modal__pane is-b">
                  <img src={compareSrcB} alt="对比图 B" className="workflow-image-preview-modal__image" draggable={false} />
                  <span className="workflow-image-preview-modal__pane-label">B</span>
                </div>
              )}
              {isSlider && (
                <div
                  className="workflow-image-preview-modal__divider"
                  role="slider"
                  tabIndex={0}
                  aria-label="对比分割线"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(sliderPosition)}
                  aria-valuetext={`A 图区域 ${Math.round(sliderPosition)}%`}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 10 : 2;
                    const positions: Record<string, number> = {
                      ArrowLeft: sliderPosition - step,
                      ArrowRight: sliderPosition + step,
                      ArrowDown: sliderPosition - step,
                      ArrowUp: sliderPosition + step,
                      Home: 0,
                      End: 100,
                    };
                    const position = positions[event.key];
                    if (typeof position !== 'number') return;
                    event.preventDefault();
                    setSliderPosition(clamp(position, 0, 100));
                  }}
                >
                  <span aria-hidden="true"><CaretLeft size={12} /><CaretRight size={12} /></span>
                </div>
              )}
            </div>
            {isCompareMode && (
              <div className="workflow-image-preview-modal__compare-strip">
                <div className="workflow-image-preview-modal__compare-controls">
                  <div role="group" aria-label="对比方式">
                    <ImagePreviewActionButton label="滑动" active={isSlider} onClick={() => setCompareLayout('slider')} />
                    <ImagePreviewActionButton label="并排" active={!isSlider} onClick={() => setCompareLayout('side-by-side')} />
                  </div>
                  <div role="group" aria-label="选择要替换的图片">
                    <ImagePreviewActionButton label="选 A" active={selectingSlot === 0} onClick={() => setSelectingSlot(0)} />
                    <ImagePreviewActionButton label="选 B" active={selectingSlot === 1} onClick={() => setSelectingSlot(1)} />
                  </div>
                  <ImagePreviewActionButton label="交换 A/B" onClick={() => setComparePair([compareB, compareA])} />
                </div>
                <div className="workflow-image-preview-modal__thumb-strip" role="group" aria-label="对比候选图片">
                  {gallery.map((item, index) => {
                    const slot = index === compareA ? 'A' : index === compareB ? 'B' : null;
                    return (
                      <button
                        key={index}
                        type="button"
                        className={`workflow-image-preview-modal__thumb ${slot ? `is-compare-${slot.toLowerCase()}` : ''}`}
                        aria-label={`第 ${index + 1} 张，${item.name}${slot ? `，当前为 ${slot} 图` : ''}`}
                        aria-pressed={index === (selectingSlot === 0 ? compareA : compareB)}
                        title={item.name}
                        onClick={() => handleCompareSelect(index)}
                      >
                        <img src={item.thumbnailSrc || item.src} alt="" draggable={false} />
                        {slot && <span className="workflow-image-preview-modal__thumb-badge">{slot}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {canvasEditorOpen && canEditImage && !isCompareMode && (
            <NodeCanvasEditorModal
              src={displaySrc}
              nodeLabel={activeImage.name || '画板'}
              onClose={() => setCanvasEditorOpen(false)}
              onSavePaint={handleCanvasSave}
              onExportLayer={onExportLayer}
            />
          )}
        </>
      )}
    </ModalSurface>,
    document.body,
  );
}

function ImagePreviewActionButton({
  icon,
  label,
  active,
  iconOnly = false,
  disabled = false,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  iconOnly?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workflow-image-preview-modal__action ${active ? 'is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
    >
      {icon}
      {!iconOnly && label}
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
  const image = await loadWorkflowImage(src, { crossOrigin: 'anonymous' });
  return drawImageToPng(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
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
