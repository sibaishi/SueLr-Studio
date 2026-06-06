import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { ChevronLeft, ChevronRight, Copy, Download, ImagePlus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

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
  onBackfillImage,
  children,
}: {
  src: string;
  alt?: string;
  closeLabel?: string;
  images?: PreviewImageItem[];
  initialIndex?: number;
  onClose: () => void;
  onBackfillImage?: (image: PreviewImageItem) => void;
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
        setCopyStatus('当前环境不支持复制图片');
        return;
      }

      const blob = await buildClipboardImageBlob(activeImage.src);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('已复制图片');
    } catch {
      setCopyStatus('复制图片失败');
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
          {children}
          {copyStatus && (
            <span className="rounded-full px-3 py-2 text-xs text-white" style={{ background: 'rgba(0,0,0,0.54)' }}>
              {copyStatus}
            </span>
          )}
          {onBackfillImage && (
            <ImagePreviewActionButton
              icon={<ImagePlus size={14} />}
              label="回填到画布"
              onClick={() => onBackfillImage(activeImage)}
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
        <img src={activeImage.src} alt={alt} className="h-full w-full object-contain" draggable={false} />
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
