import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { ChevronLeft, ChevronRight, Copy, Download, Maximize2 } from 'lucide-react';
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
  children,
}: {
  src: string;
  alt?: string;
  closeLabel?: string;
  images?: PreviewImageItem[];
  initialIndex?: number;
  onClose: () => void;
  onApplyResize?: (resizedBlobUrl: string, w: number, h: number, blob?: Blob) => void;
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
  const origSizesRef = useRef<Record<number, { w: number; h: number }>>({});
  const activeImage = gallery[activeIndex] || gallery[0];
  const displaySrc = resizedSrcs[activeIndex] || activeImage.src;
  const canNavigate = gallery.length > 1;

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

  const handleApplyResize = useCallback(async () => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.crossOrigin = 'anonymous';
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('image load failed'));
        nextImage.src = displaySrc;
      });

      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      if (!origSizesRef.current[activeIndex]) {
        origSizesRef.current[activeIndex] = { w: origW, h: origH };
      }

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
      setResizedSrcs((prev) => {
        const next = { ...prev, [activeIndex]: url };
        if (prev[activeIndex]) URL.revokeObjectURL(prev[activeIndex]);
        return next;
      });
      onApplyResize?.(url, w, h, blob);
    } catch {
      // silently fail
    }
  }, [displaySrc, activeIndex, resizeMode, scalePercent, targetWidth, targetHeight, onApplyResize]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
      style={{
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl"
        style={{
          width: 'min(1120px, 90vw)',
          height: 'min(820px, 86vh)',
          background: 'rgba(12, 12, 14, 0.88)',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full px-3 py-1 text-xs"
          style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}
        >
          {closeLabel}
        </button>
        <ImageSizeLabel
          src={displaySrc}
          className="absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-xs text-white"
        />
        {canNavigate && (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white"
              style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(8px)' }}
              aria-label="上一张"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white"
              style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(8px)' }}
              aria-label="下一张"
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
          {children}
          {showResize && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(0,0,0,0.64)', backdropFilter: 'blur(12px)' }}
            >
              <select
                value={resizeMode}
                onChange={(e) => setResizeMode(e.target.value as 'percent' | 'dimensions')}
                className="rounded-lg border-0 px-2 py-1 text-xs"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
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
                    onChange={(e) => setScalePercent(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                    className="w-16 rounded-lg border-0 px-2 py-1 text-right text-xs"
                    style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                  />
                  <span className="text-xs text-white/60">%</span>
                </>
              ) : (
                <>
                  <input
                    type="number"
                    value={targetWidth || ''}
                    min={1}
                    onChange={(e) => setTargetWidth(Math.max(1, Number(e.target.value) || 0))}
                    className="w-16 rounded-lg border-0 px-2 py-1 text-right text-xs"
                    style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    placeholder="宽"
                  />
                  <span className="text-xs text-white/40">×</span>
                  <input
                    type="number"
                    value={targetHeight || ''}
                    min={1}
                    onChange={(e) => setTargetHeight(Math.max(1, Number(e.target.value) || 0))}
                    className="w-16 rounded-lg border-0 px-2 py-1 text-right text-xs"
                    style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    placeholder="高"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => { void handleApplyResize(); }}
                className="rounded-lg px-2 py-1 text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
              >
                应用
              </button>
            </div>
          )}
          {copyStatus && (
            <span className="rounded-full px-3 py-2 text-xs text-white" style={{ background: 'rgba(0,0,0,0.54)' }}>
              {copyStatus}
            </span>
          )}
          <ImagePreviewActionButton
            icon={<Maximize2 size={14} />}
            label="缩放"
            onClick={() => setShowResize((prev) => !prev)}
          />
          <ImagePreviewActionButton
            icon={<Copy size={14} />}
            label="复制图片"
            onClick={() => {
              void handleCopyImage();
            }}
          />
          <ImagePreviewActionButton icon={<Download size={14} />} label="另存为" onClick={handleSaveAs} />
        </div>
        <img src={displaySrc} alt={alt} className="h-full w-full object-contain" draggable={false} />
      </div>
    </div>,
    document.body,
  );
}

function ImagePreviewActionButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-white"
      style={{ background: 'rgba(0,0,0,0.54)', backdropFilter: 'blur(8px)' }}
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
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.crossOrigin = 'anonymous';
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('image load failed'));
    nextImage.src = src;
  });

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
