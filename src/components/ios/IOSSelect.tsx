import React from 'react';
import { useT } from '../../contexts/ThemeContext';
import { glass } from './glass';

export function IOSSelect({ value, onChange, children, disabled = false, style = {} }: { value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties }) {
  const T = useT();
  return (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={{
      width: '100%', ...glass(0.06), color: T.text, fontSize: 13, borderRadius: 10,
      padding: '9px 32px 9px 12px', border: `1px solid ${T.border}`, outline: 'none', appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(T.text2)}' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', opacity: disabled ? 0.55 : 1, ...style,
    }}>{children}</select>
  );
}
