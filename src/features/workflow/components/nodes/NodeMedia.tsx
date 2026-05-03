import { useState, type CSSProperties } from 'react';
import { ImagePreviewModal } from '@/features/workflow/components/ImagePreviewModal';
import { ImageSizeLabel } from '@/features/workflow/components/ImageSizeLabel';

export function TextCard({ text, mono = false }: { text: string; mono?: boolean }) {
  return (
    <div className="node-value-card">
      <div className="node-value-card__actions">
        <ActionButton label="复制文本" onClick={() => void navigator.clipboard?.writeText(text)} />
      </div>
      <div
        className={['node-value-card__body', mono ? 'node-value-card__body--mono' : ''].filter(Boolean).join(' ')}
      >
        {text || '(空内容)'}
      </div>
    </div>
  );
}

export function MediaCard({ value, compact = false, fill = false }: { value: string; compact?: boolean; fill?: boolean }) {
  const kind = getMediaKind(value);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="node-media-card" style={{ height: fill ? '100%' : undefined }}>
      <MediaPreview value={value} compact={compact} fill={fill} onPreviewImage={() => setPreviewOpen(true)} />
      <div className="node-media-card__actions">
        {kind === 'image' && <ActionButton label="查看大图" onClick={() => setPreviewOpen(true)} />}
        <ActionButton label="下载保存" onClick={() => downloadUrl(value)} />
      </div>
      {previewOpen && <ImagePreviewModal src={value} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

export function MediaPreview({
  value,
  compact = false,
  onPreviewImage,
  inertImage = false,
  kindOverride,
  fill = false,
  minHeightOverride,
}: {
  value: string;
  compact?: boolean;
  onPreviewImage?: () => void;
  inertImage?: boolean;
  kindOverride?: 'image' | 'video' | 'audio';
  fill?: boolean;
  minHeightOverride?: number;
}) {
  const kind = kindOverride || getMediaKind(value);
  const minHeight = minHeightOverride ?? (compact ? 44 : 72);
  const baseFrameStyle: CSSProperties = {
    flex: fill ? '1 1 auto' : '0 0 auto',
    height: fill ? '100%' : undefined,
    minHeight,
  };

  if (kind === 'image') {
    return (
      <button
        type="button"
        className="node-media-preview node-media-preview--image"
        onClick={inertImage ? undefined : onPreviewImage}
        title={inertImage ? undefined : '点击查看大图'}
        style={{
          ...baseFrameStyle,
          backgroundImage: `url("${value}")`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          cursor: inertImage ? 'default' : 'zoom-in',
        }}
      >
        <ImageSizeLabel src={value} className="node-media-preview__size" />
      </button>
    );
  }

  if (kind === 'video') {
    return (
      <video
        className="node-media-preview node-media-preview--video"
        src={value}
        controls
        style={{
          ...baseFrameStyle,
          maxHeight: fill ? undefined : compact ? '100%' : 240,
          objectFit: 'contain',
        }}
      />
    );
  }

  if (kind === 'audio') {
    return <audio className="node-media-preview node-media-preview--audio" src={value} controls />;
  }

  return <TextCard text={value} />;
}

export function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="node-mini-action"
    >
      {label}
    </button>
  );
}

export function ParamBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="node-param-badge"
      style={{
        '--badge-color': color,
      } as CSSProperties}
    >
      {label}
    </span>
  );
}

export function getMediaKind(value: string): 'image' | 'video' | 'audio' | 'unknown' {
  if (value.startsWith('blob:')) return 'image';
  if (value.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value)) return 'image';
  if (value.startsWith('data:video/') || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value)) return 'video';
  if (value.startsWith('data:audio/') || /\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(value)) return 'audio';
  return 'unknown';
}

export function isMediaUrl(value: string) {
  return getMediaKind(value) !== 'unknown';
}

function downloadUrl(value: string) {
  const link = document.createElement('a');
  link.href = value;
  link.download = value.split('/').pop()?.split('?')[0] || 'flow-output';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
