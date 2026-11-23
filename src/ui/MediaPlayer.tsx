import type { MediaHTMLAttributes } from 'react';

export function MediaPlayer({
  kind,
  preload = 'metadata',
  className = '',
  ...props
}: MediaHTMLAttributes<HTMLMediaElement> & { kind: 'audio' | 'video' }) {
  const shared = {
    controls: true,
    preload,
    ...props,
    className: `ui-media-player ${className}`,
  };
  return kind === 'audio' ? <audio {...shared} /> : <video playsInline {...shared} />;
}
