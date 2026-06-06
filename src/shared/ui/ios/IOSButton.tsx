import { useT } from '@/providers/ThemeContext';
import type React from 'react';

export function IOSButton({
  label,
  onClick,
  color,
  disabled = false,
  small = false,
  style = {},
  ...buttonProps
}: {
  label: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const T = useT();
  const c = color || T.blue;
  return (
    <button
      className="ios-btn"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? 'var(--btn-padding-sm)' : 'var(--btn-padding)',
        borderRadius: 'var(--btn-radius)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: small ? 'var(--btn-font-size-sm)' : 'var(--btn-font-size)',
        fontWeight: 'var(--btn-font-weight)',
        color: disabled ? T.text3 : 'var(--btn-primary-color)',
        background: disabled ? T.card2 : c,
        width: small ? 'auto' : '100%',
        opacity: disabled ? 0.5 : 1,
        transition: 'var(--btn-transition)',
        ...style,
      }}
      {...buttonProps}
    >
      {label}
    </button>
  );
}
