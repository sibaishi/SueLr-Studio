import { useT } from '@/providers/ThemeContext';
import { Bot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function SplashScreen({ done, onHidden }: { done: boolean; onHidden: () => void }) {
  const T = useT();
  const [fading, setFading] = useState(false);
  const hiddenRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    if (done && !hiddenRef.current) {
      hiddenRef.current = true;
      const elapsed = Date.now() - mountTimeRef.current;
      const minDisplay = 800;
      const delay = Math.max(0, minDisplay - elapsed);

      const startFade = () => {
        setFading(true);
        const timer = window.setTimeout(onHidden, 500);
        return () => clearTimeout(timer);
      };

      if (delay > 0) {
        const delayTimer = window.setTimeout(startFade, delay);
        return () => clearTimeout(delayTimer);
      }
      return startFade();
    }
  }, [done, onHidden]);

  return (
    <div
      className="splash-overlay"
      style={{ background: T.bg, opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}
    >
      <div className="splash-logo" style={{ background: T.blue, boxShadow: `0 12px 40px ${T.blue}50` }}>
        <Bot size={36} color="#fff" />
      </div>
      <div className="splash-title" style={{ color: T.text }}>
        AI 多模态助手
      </div>
      <div className="splash-dots">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="splash-dot"
            style={{ background: T.text3, animation: `dotBounce 1.2s ease-in-out ${index * 0.15}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}
