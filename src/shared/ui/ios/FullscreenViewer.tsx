import { useT } from '@/providers/ThemeContext';
import { ImagePlus, X } from 'lucide-react';
import { glass, lightOverlay } from './glass';

export function FullscreenViewer({
  url,
  mediaType = 'image',
  onClose,
  actionLabel,
  onAction,
}: {
  url: string | null;
  mediaType?: 'image' | 'video';
  onClose: () => void;
  actionLabel?: string;
  onAction?: (url: string) => void;
}) {
  const T = useT();
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: lightOverlay(T),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {mediaType === 'video' ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          onClick={(event) => event.stopPropagation()}
          style={{
            maxWidth: '95vw',
            maxHeight: '95vh',
            borderRadius: 18,
            boxShadow: '0 24px 56px rgba(15,23,42,0.24)',
            background: '#000',
          }}
        />
      ) : (
        <img
          src={url}
          alt=""
          style={{
            maxWidth: '95vw',
            maxHeight: '95vh',
            objectFit: 'contain',
            borderRadius: 18,
            boxShadow: '0 24px 56px rgba(15,23,42,0.24)',
          }}
        />
      )}
      {onAction && actionLabel && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onAction(url);
          }}
          style={{
            position: 'absolute',
            left: 20,
            bottom: 20,
            minHeight: 40,
            padding: '0 14px',
            borderRadius: 20,
            ...glass(0.15),
            border: `1px solid ${T.border}`,
            color: T.text,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <ImagePlus size={16} />
          {actionLabel}
        </button>
      )}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: 20,
          ...glass(0.15),
          border: `1px solid ${T.border}`,
          color: T.text,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
