import { MediaPlayer } from '@/ui/MediaPlayer';
import { useState, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import './node-foundations.css';

export function NodeContentSurface({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`workflow-content-surface ${className}`} />;
}

export function NodeContentFrame({
  layout = 'preview',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { layout?: 'preview' | 'empty' | 'text' | 'list' }) {
  return <div {...props} data-layout={layout} className={`workflow-content-frame ${className}`} />;
}

export function NodeEmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="workflow-content-empty">
      <span aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export function NodeTextPreview({
  variant = 'response',
  className = '',
  onPreview,
  onKeyDown,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'response' | 'snippet'; onPreview?: () => void }) {
  return (
    <div
      {...props}
      data-variant={variant}
      className={`workflow-text-preview nodrag nowheel ${className}`}
      role={onPreview ? 'button' : undefined}
      tabIndex={onPreview ? 0 : undefined}
      onDoubleClick={onPreview}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        event.stopPropagation();
        if (!event.defaultPrevented && onPreview && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onPreview();
        }
      }}
    />
  );
}

export function NodeImagePreview({
  thumbnail = false,
  onPreview,
  className = '',
  ...props
}: ComponentProps<'img'> & { thumbnail?: boolean; onPreview: () => void }) {
  return (
    <button
      type="button"
      className={`workflow-image-preview nodrag nopan ${className}`}
      data-thumbnail={thumbnail || undefined}
      title="双击或按 Enter 全屏查看"
      aria-label={props.alt || '全屏查看图片'}
      onDoubleClick={onPreview}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPreview();
        }
      }}
    >
      <img {...props} />
    </button>
  );
}

export function NodeMediaPreview({
  kind,
  src,
  fill = false,
}: { kind: 'audio' | 'video'; src: string; fill?: boolean }) {
  return (
    <MediaPlayer
      kind={kind}
      src={src || undefined}
      className="workflow-media-preview nodrag nopan nowheel"
      data-fill={fill || undefined}
    />
  );
}

export function NodeAttachmentStrip({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`workflow-attachment-strip nodrag ${className}`} />;
}

export function NodeAttachmentChip({
  dragging,
  dropTarget,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { dragging?: boolean; dropTarget?: boolean }) {
  return (
    <div
      {...props}
      className={`workflow-attachment-chip ${className}`}
      data-dragging={dragging || undefined}
      data-drop-target={dropTarget || undefined}
    />
  );
}

export function NodeAttachmentThumbnail({
  type,
  value = '',
  label,
  src,
  compact = false,
}: { type: string; value?: string; label?: string; src?: string; compact?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const fallback = type === 'image' ? '图' : type === 'video' ? '视' : type === 'audio' ? '音' : '?';
  return (
    <div
      className="workflow-attachment-thumbnail"
      data-compact={compact || undefined}
      title={type === 'text' ? value : label}
    >
      {(type === 'image' || type === 'video') && src && failedSrc !== src ? (
        <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} />
      ) : type === 'text' ? (
        <span className="workflow-attachment-excerpt">{value.slice(0, 30)}</span>
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}

export interface NodeAttachmentGroup {
  sourceNodeId: string;
  sourceNodeLabel: string;
  items: { id: string; type: string; value: string; label: string }[];
}

/** Presentation owns transient drag feedback; callers retain edge ordering and persistence. */
export function NodeInputAttachments({
  groups,
  onReorder,
  resolveThumbnail,
}: {
  groups: Record<string, NodeAttachmentGroup[]>;
  onReorder: (type: string, from: number, to: number) => void;
  resolveThumbnail: (value: string) => string;
}) {
  const [dragged, setDragged] = useState<{ type: string; index: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const reset = () => {
    setDragged(null);
    setOver(null);
  };
  return (
    <NodeAttachmentStrip aria-label="上游输入附件">
      {['text', 'image', 'video', 'audio'].flatMap((type) =>
        (groups[type] || []).map((group, index) => (
          <NodeAttachmentChip
            key={`${type}-${group.sourceNodeId}`}
            draggable
            dragging={dragged?.type === type && dragged.index === index}
            dropTarget={dragged?.type === type && over === index}
            onDragStart={(event) => {
              event.stopPropagation();
              setDragged({ type, index });
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.stopPropagation();
              if (dragged?.type !== type) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOver(index);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => {
              event.stopPropagation();
              event.preventDefault();
              if (dragged?.type === type && dragged.index !== index) onReorder(type, dragged.index, index);
              reset();
            }}
            onDragEnd={reset}
          >
            <span className="workflow-attachment-kind">
              {{ text: '文', image: '图', video: '视', audio: '音' }[type]}
            </span>
            <span className="workflow-attachment-label">{group.sourceNodeLabel}</span>
            <div className="workflow-attachment-items">
              {group.items.map((item) => (
                <NodeAttachmentThumbnail key={item.id} {...item} src={resolveThumbnail(item.value) || item.value} />
              ))}
            </div>
          </NodeAttachmentChip>
        )),
      )}
    </NodeAttachmentStrip>
  );
}
