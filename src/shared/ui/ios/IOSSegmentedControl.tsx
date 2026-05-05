import { useT } from '@/contexts/ThemeContext';
import { glass } from './glass';

export function IOSSegmentedControl({ options, value, onChange }: { options: { l: string; v: string }[]; value: string; onChange: (v: string) => void }) {
  const T = useT();
  const isLight = typeof T.bg === 'string' && T.bg.toLowerCase() !== '#000000';
  return (
    <div style={{ ...glass(isLight ? 0.16 : 0.08), borderRadius: 12, padding: 4, display: 'flex', gap: 4, border: `1px solid ${T.border}` }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: value === o.v ? 600 : 500,
          color: value === o.v ? T.text : T.text2,
          background: value === o.v ? (isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)') : 'transparent',
          boxShadow: value === o.v ? (isLight ? '0 1px 2px rgba(15,23,42,0.08), 0 6px 16px rgba(15,23,42,0.06)' : '0 2px 8px rgba(0,0,0,0.16)') : 'none', transition: 'all 0.2s',
        }}>{o.l}</button>
      ))}
    </div>
  );
}
