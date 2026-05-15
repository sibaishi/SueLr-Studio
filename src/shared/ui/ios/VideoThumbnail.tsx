import { Play } from 'lucide-react';
import { glass } from './glass';

export function VideoThumbnail({ src, onClick }: { src: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', ...glass(0.04), aspectRatio: '16/9', cursor: onClick ? 'pointer' : 'default' }}>
      <video src={src} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'playPulse 2s ease-in-out infinite' }}><Play size={20} color="#fff" fill="#fff" /></div>
      </div>
    </div>
  );
}
