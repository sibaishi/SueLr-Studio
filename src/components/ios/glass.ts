import { useT } from '../../contexts/ThemeContext';

export function glass(opacity = 0.06) {
  return { background: `rgba(255,255,255,${opacity})`, backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)' };
}
export function glassLight(opacity = 0.1) {
  return { background: `rgba(255,255,255,${opacity})`, backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)' };
}
export function lightOverlay(T: ReturnType<typeof useT>) {
  const isLight = T.bg === 'transparent' && T.text.startsWith('rgba(0');
  return isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
}
