import { useT } from '@/providers/ThemeContext';
import { Eye, EyeOff } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { glass } from './glass';

type IOSInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
};

export function IOSInput({ value, onChange, placeholder, type = 'text', style = {}, ...inputProps }: IOSInputProps) {
  const T = useT();
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === 'password';
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...inputProps}
        type={isPassword && showPw ? 'text' : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          ...glass(0.06),
          color: T.text,
          fontSize: 14,
          borderRadius: 10,
          padding: '10px 14px',
          border: `1px solid ${T.border}`,
          outline: 'none',
          paddingRight: isPassword ? 40 : 14,
          ...style,
        }}
      />
      {isPassword && (
        <button
          onClick={() => setShowPw(!showPw)}
          type="button"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: T.text2,
            cursor: 'pointer',
            display: 'flex',
            padding: 4,
          }}
        >
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );
}
