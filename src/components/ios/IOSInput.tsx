import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';
import { glass } from './glass';

export function IOSInput({ value, onChange, placeholder, type = 'text', style = {} }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties }) {
  const T = useT();
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === 'password';
  return (
    <div style={{ position: 'relative' }}>
      <input type={isPassword && showPw ? 'text' : type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', ...glass(0.06), color: T.text, fontSize: 14, borderRadius: 10,
        padding: '10px 14px', border: `1px solid ${T.border}`, outline: 'none',
        paddingRight: isPassword ? 40 : 14, ...style,
      }} />
      {isPassword && (
        <button onClick={() => setShowPw(!showPw)} type="button" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.text2, cursor: 'pointer', display: 'flex', padding: 4 }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );
}
