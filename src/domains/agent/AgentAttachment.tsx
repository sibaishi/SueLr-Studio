import { AgentMediaPreview, type AgentPreview } from './AgentMediaPreview';
import { File as FileIcon, MagnifyingGlassPlus } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

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
  const [opened, setOpened] = useState<AgentPreview>();
  const [openError, setOpenError] = useState(false);
  const objectUrl = useRef('');
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  async function open() {
    setOpenError(false);
    try {
      const fileKind =
        file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name)
          ? 'audio'
          : file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
            ? 'pdf'
            : kind;
      if (fileKind === 'text') {
        setOpened({ kind: 'text', name: file.name, source: await file.text() });
        return;
      }
      if (!objectUrl.current) objectUrl.current = URL.createObjectURL(file);
      setOpened({ kind: fileKind, name: file.name, source: objectUrl.current });
    } catch {
      setOpenError(true);
    }
  }

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
    <figure className="agent-panel__attachment-preview" onDoubleClick={() => void open()}>
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
        {failed && ' · 无法内嵌预览'}
        <button
          type="button"
          className="agent-preview-trigger"
          onClick={() => void open()}
          onDoubleClick={(event) => event.stopPropagation()}
          title={`查看 ${file.name}`}
          aria-label={`查看 ${file.name}`}
        >
          <MagnifyingGlassPlus size={14} aria-hidden="true" />
        </button>
      </figcaption>
      {openError && <span role="alert">无法读取文件。</span>}
      {opened && <AgentMediaPreview item={opened} onClose={() => setOpened(undefined)} />}
    </figure>
  );
}
