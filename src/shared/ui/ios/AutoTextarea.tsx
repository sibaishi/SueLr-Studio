import React, { useRef, useEffect } from 'react';
import { useT } from '@/providers/ThemeContext';
import { glass } from './glass';

export function AutoTextarea({ value, onChange, placeholder, maxH = 160, onKeyDown, onBlur, disabled = false, style = {} }: { value: string; onChange: (v: string) => void; placeholder?: string; maxH?: number; onKeyDown?: (e: React.KeyboardEvent) => void; onBlur?: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  const T = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjust = () => { const el = ref.current; if (!el) return; el.style.overflowY = 'hidden'; el.style.height = '0px'; const sh = el.scrollHeight; el.style.height = Math.min(sh, maxH) + 'px'; el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'; };
  useEffect(adjust, [value, maxH]);
  return <textarea ref={ref} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} onBlur={onBlur}
    style={{ display: 'block', margin: 0, resize: 'none', overflowY: 'auto', width: '100%', ...glass(0.04), color: T.text, fontSize: 14, borderRadius: 10, padding: '10px 14px', border: `1px solid ${T.border}`, outline: 'none', lineHeight: '22px', minHeight: 36, maxHeight: maxH, boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text', opacity: disabled ? 0.55 : 1, ...style }} />;
}
