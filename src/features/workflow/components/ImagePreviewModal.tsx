import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ImageSizeLabel } from '@/features/workflow/components/ImageSizeLabel';

export function ImagePreviewModal({
  src,
  alt = '查看大图',
  closeLabel = '关闭',
  onClose,
}: {
  src: string;
  alt?: string;
  closeLabel?: string;
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
          src={src}
          className="absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-xs text-white"
        />
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
    </div>,
    document.body
  );
}
