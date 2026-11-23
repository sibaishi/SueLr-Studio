import { StudioStartup } from '@/ui/StudioStartup';
import { useEffect, useRef, useState } from 'react';

export function SplashScreen({ done, onHidden }: { done: boolean; onHidden: () => void }) {
  const [fading, setFading] = useState(false);
  const [artworkReady, setArtworkReady] = useState(false);
  const mountTimeRef = useRef(Date.now());
  const callback = useRef(onHidden);
  callback.current = onHidden;
  useEffect(() => {
    if (!done || !artworkReady) return;
    let fadeTimer: number | undefined;
    const delayTimer = window.setTimeout(
      () => {
        setFading(true);
        fadeTimer = window.setTimeout(() => callback.current(), 320);
      },
      Math.max(0, 800 - (Date.now() - mountTimeRef.current)),
    );
    return () => {
      window.clearTimeout(delayTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [done, artworkReady]);
  return (
    <div className="splash-overlay" style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}>
      <StudioStartup done={done} onArtworkReady={() => setArtworkReady(true)} />
    </div>
  );
}
