import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Copy, Download, ImagePlus } from 'lucide-react';
import { ImageSizeLabel } from '@/features/workflow/components/ImageSizeLabel';

export interface PreviewImageItem {
  src: string;
  name?: string;
}

export function ImagePreviewModal({
  src,
  alt = '查看大图',
  closeLabel = '关闭',
  images,
  initialIndex,
  onClose,
  onBackfillImage,
}: {
  src: string;
  alt?: string;
  closeLabel?: string;
  images?: PreviewImageItem[];
  initialIndex?: number;
  onClose: () => void;
  onBackfillImage?: (image: PreviewImageItem) => void;
}) {
  const gallery = useMemo(() => {
    const normalized = (images && images.length > 0 ? images : [{ src }])
      .filter((item) => item.src)
      .map((item) => ({ src: item.src, name: item.name || imageNameFromUrl(item.src) }));
    return normalized.length > 0 ? normalized : [{ src, name: imageNameFromUrl(src) }];
  }, [images, src]);
  const resolvedInitialIndex = typeof initialIndex === 'number' && initialIndex >= 0 && initialIndex < gallery.length
    ? initialIndex
    : Math.max(0, gallery.findIndex((item) => item.src === src));
  const [activeIndex, setActiveIndex] = useState(resolvedInitialIndex);
  const [copyStatus, setCopyStatus] = useState('');
  const activeImage = gallery[activeIndex] || gallery[0];
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
        await navigator.clipboard?.writeText(activeImage.src);
        setCopyStatus('已复制链接');
        return;
      }

      const response = await fetch(activeImage.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      setCopyStatus('已复制图片');
    } catch {
      await navigator.clipboard?.writeText(activeImage.src);
      setCopyStatus('已复制链接');
    }
    window.setTimeout(() => setCopyStatus(''), 1600);
  };

  const handleSaveAs = () => {
    const link = document.createElement('a');
    link.href = activeImage.src;
    link.download = activeImage.name || imageNameFromUrl(activeImage.src) || 'image';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

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
          src={activeImage.src}
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
          {copyStatus && (
            <span className="rounded-full px-3 py-2 text-xs text-white" style={{ background: 'rgba(0,0,0,0.54)' }}>
              {copyStatus}
            </span>
          )}
          {onBackfillImage && (
            <ImagePreviewActionButton icon={<ImagePlus size={14} />} label="回填到画布" onClick={() => onBackfillImage(activeImage)} />
          )}
          <ImagePreviewActionButton icon={<Copy size={14} />} label="复制图片" onClick={() => { void handleCopyImage(); }} />
          <ImagePreviewActionButton icon={<Download size={14} />} label="另存为" onClick={handleSaveAs} />
        </div>
        <img
          src={activeImage.src}
          alt={alt}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
    </div>,
    document.body
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
