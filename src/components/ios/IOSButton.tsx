import React from 'react';
import { useT } from '../../contexts/ThemeContext';

export function IOSButton({ label, onClick, color, disabled = false, small = false, style = {} }: {
  label: string; onClick: () => void; color?: string; disabled?: boolean; small?: boolean; style?: React.CSSProperties;
}) {
  const T = useT();
  const c = color || T.blue;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '6px 14px' : '10px 20px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: small ? 12 : 14, fontWeight: 600, color: disabled ? T.text3 : '#fff',
      background: disabled ? T.card2 : c, width: small ? 'auto' : '100%',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.2s', ...style,
    }}>{label}</button>
  );
}
