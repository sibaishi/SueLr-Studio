import React from 'react';
import { glass } from './glass';

type IOSCardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function IOSCard({ children, style = {}, ...divProps }: IOSCardProps) {
  return <div {...divProps} className="glass-card" style={{ ...glass(0.05), borderRadius: 18, padding: 16, border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(15,23,42,0.08)', transition: 'all 0.3s ease', ...style }}>{children}</div>;
}
