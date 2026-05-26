import type { CSSProperties } from 'react';
import { MediaCard, TextCard, isMediaUrl } from './NodeMedia';

export function OutputContent({
  outputs,
  outerStyle,
  isLastSection,
}: {
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
  isLastSection: boolean;
}) {
  const savedFiles = Array.isArray(outputs?.savedFiles) ? outputs.savedFiles : [];
  const rawContent = outputs?.content;
  const content = (() => {
    if (
      typeof rawContent === 'string' &&
      rawContent.startsWith('/api/outputs/') &&
      isRenderableOutputMediaUrl(rawContent)
    ) {
      const matched = savedFiles.find(
        (file) =>
          file &&
          typeof file === 'object' &&
          typeof (file as { url?: unknown }).url === 'string' &&
          (file as { url: string }).url === rawContent &&
          (file as { type?: unknown }).type === 'image',
      ) as { url: string; thumbnailUrl?: string; type?: string; width?: number; height?: number } | undefined;
      if (matched) return matched;
    }
    return rawContent;
  })();
  void isLastSection;

  if (content === undefined || content === null) {
    return (
      <div className="node-content-shell node-output-content node-output-content--empty" style={outerStyle}>
        <span>等待输入内容...</span>
      </div>
    );
  }

  return (
    <div className="node-content-shell node-output-content" style={{ ...outerStyle, overflow: 'hidden' }}>
      <InteractiveValue value={content} />
    </div>
  );
}

function InteractiveValue({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    if (isRenderableOutputMediaUrl(value)) {
      if (getMediaKindFromOutputValue(value) === 'image') {
        return <MediaCard value={value} fill />;
      }
      return <MediaCard value={value} fill />;
    }
    return <TextCard text={value} />;
  }

  if (isRenderableOutputMediaObject(value)) {
    if (value.type === 'image' && isRenderableOutputMediaUrl(value.url)) {
      return <MediaCard value={value.url} fill />;
    }
    if (isRenderableOutputMediaUrl(value.url)) {
      return <MediaCard value={value.url} fill />;
    }
  }

  if (Array.isArray(value)) {
    const mediaValues = value.filter(
      (item): item is string => typeof item === 'string' && isRenderableOutputMediaUrl(item),
    );
    if (mediaValues.length === value.length && mediaValues.length > 0) {
      if (mediaValues.length === 1) {
        if (getMediaKindFromOutputValue(mediaValues[0]) === 'image') {
          return <MediaCard value={mediaValues[0]} fill />;
        }
        return <MediaCard value={mediaValues[0]} fill />;
      }

      return (
        <div className="node-media-grid">
          {mediaValues.map((item, index) =>
            getMediaKindFromOutputValue(item) === 'image' ? (
              <MediaCard key={String(index)} value={item} compact fill />
            ) : (
              <MediaCard key={String(index)} value={item} compact fill />
            ),
          )}
        </div>
      );
    }
    return <TextCard text={JSON.stringify(value, null, 2)} mono />;
  }

  return <TextCard text={JSON.stringify(value, null, 2)} mono />;
}

function isRenderableOutputMediaUrl(value: string) {
  if (value.startsWith('data:') || value.startsWith('blob:')) return isMediaUrl(value);
  if (value.startsWith('/api/files/') || value.startsWith('/api/outputs/')) return isMediaUrl(value);
  return false;
}

function isRenderableOutputMediaObject(
  value: unknown,
): value is { url: string; thumbnailUrl?: string; type?: string; width?: number; height?: number } {
  return Boolean(value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string');
}

function getMediaKindFromOutputValue(value: string) {
  if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value) || value.startsWith('data:image/') || value.startsWith('blob:'))
    return 'image';
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value) || value.startsWith('data:video/')) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(value) || value.startsWith('data:audio/')) return 'audio';
  return 'unknown';
}
