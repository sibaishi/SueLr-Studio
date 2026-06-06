import type React from 'react';
import { glass } from './glass';

type IOSCardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function IOSCard({ children, style = {}, ...divProps }: IOSCardProps) {
  return (
    <div
      {...divProps}
      className="glass-card"
      style={{
        ...glass(0.05),
        borderRadius: 'var(--card-radius)',
        padding: 'var(--card-padding)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--card-shadow)',
        transition: 'var(--card-transition)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
