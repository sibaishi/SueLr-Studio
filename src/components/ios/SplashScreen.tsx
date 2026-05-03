import { Bot } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';

export function SplashScreen({ fading }: { fading: boolean }) {
  const T = useT();
  return (
    <div className="splash-overlay" style={{ background: T.bg, opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}>
      <div className="splash-logo" style={{ background: T.blue, boxShadow: `0 12px 40px ${T.blue}50` }}><Bot size={36} color="#fff" /></div>
      <div className="splash-title" style={{ color: T.text }}>AI 多模态助手</div>
      <div className="splash-dots">{[0, 1, 2].map(i => <div key={i} className="splash-dot" style={{ background: T.text3, animation: `dotBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}</div>
    </div>
  );
}
