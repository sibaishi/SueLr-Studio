import { useEffect, useState, type CSSProperties } from 'react';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { LongTextEditorModal } from './LongTextEditorModal';

export function inferImageThumbnailUrl(value: string) {
  const source = String(value || '').trim();
  if (!source || source.includes('/.thumbnails/') || /__thumb\.jpg(?:\?.*)?$/i.test(source)) return '';

  const uploadMatch = source.match(/^(.+\/api\/files)\/([^/?#]+)(\?.*)?$/i);
  if (uploadMatch) {
    const [, prefix, filename] = uploadMatch;
    const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const baseName = extension ? filename.slice(0, -extension.length) : filename;
    return `${prefix}/.thumbnails/${baseName}__thumb.jpg`;
  }

  const outputMatch = source.match(/^(.+\/api\/outputs)\/(.+\/)?([^/?#/]+)(\?.*)?$/i);
  if (outputMatch) {
    const [, prefix, directory = '', filename] = outputMatch;
    const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const baseName = extension ? filename.slice(0, -extension.length) : filename;
    return `${prefix}/${directory}.thumbnails/${baseName}__thumb.jpg`;
  }

  return '';
}

export function TextCard({ text, mono = false }: { text: string; mono?: boolean }) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const displayText = text || '(空内容)';
  const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;

  return (
    <div className="node-value-card">
      <div className="node-value-card__actions">
        <ActionButton label="复制文本" onClick={() => void navigator.clipboard?.writeText(text)} />
      </div>
      <div
        role="button"
        tabIndex={0}
        className={['node-value-card__body', mono ? 'node-value-card__body--mono' : ''].filter(Boolean).join(' ')}
        title="双击全屏查看"
        onDoubleClick={() => setFullscreenOpen(true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') setFullscreenOpen(true);
        }}
      >
        {displayText}
      </div>
      <div className="node-value-card__meta">
        <span>{lineCount} 行 · {text.length} 字符</span>
      </div>
      {fullscreenOpen && (
        <LongTextEditorModal
          title="查看输出文本"
          value={text}
          readOnly
          placeholder=""
          onChange={() => undefined}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
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
  previewValue,
  compact = false,
  onPreviewImage,
  inertImage = false,
  kindOverride,
  fill = false,
  minHeightOverride,
}: {
  value: string;
  previewValue?: string;
  compact?: boolean;
  onPreviewImage?: () => void;
  inertImage?: boolean;
  kindOverride?: 'image' | 'video' | 'audio';
  fill?: boolean;
  minHeightOverride?: number;
}) {
  const displayValue = previewValue || value;
  const kind = kindOverride || getMediaKind(displayValue);
  const [resolvedPreviewValue, setResolvedPreviewValue] = useState(displayValue || value);

  useEffect(() => {
    setResolvedPreviewValue(displayValue || value);
  }, [displayValue, value]);

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
          cursor: inertImage ? 'default' : 'zoom-in',
        }}
      >
        <img
          src={resolvedPreviewValue}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => {
            if (resolvedPreviewValue !== value) {
              setResolvedPreviewValue(value);
            }
          }}
          style={{
            background: 'var(--node-card-field)',
          }}
        />
        <ImageSizeLabel src={resolvedPreviewValue} className="node-media-preview__size" />
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
