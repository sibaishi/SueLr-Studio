import { File as FileIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

export function getAttachmentKind(file: File) {
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg|bmp|ico)$/i.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('text/') || /\.(txt|md|csv|tsv|json|ya?ml|xml|log|srt|vtt)$/i.test(file.name)) return 'text';
  return 'file';
}

export default function AgentAttachment({ file }: { file: File }) {
  const kind = getAttachmentKind(file);
  const [preview, setPreview] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (kind === 'text') {
      let active = true;
      file
        .slice(0, 64 * 1024)
        .text()
        .then((text) => {
          if (active) setPreview(text);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }
    if (kind === 'image' || kind === 'video') {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, kind]);

  return (
    <figure className="agent-panel__attachment-preview">
      {!failed && preview && kind === 'image' && <img src={preview} alt={file.name} onError={() => setFailed(true)} />}
      {!failed && preview && kind === 'video' && (
        // biome-ignore lint/a11y/useMediaCaption: Local user-supplied videos may not include captions.
        <video
          src={preview}
          aria-label={file.name}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      {!failed && kind === 'text' && (
        <pre tabIndex={0} aria-label={`${file.name} 文本预览`}>
          {preview || '空文本'}
          {file.size > 64 * 1024 && '\n…'}
        </pre>
      )}
      <figcaption>
        <FileIcon size={13} />
        {file.name}
        {failed && ' · 无法预览'}
      </figcaption>
    </figure>
  );
}
