import React from 'react';
import { useT } from '../../contexts/ThemeContext';

export function IOSLabel({ children }: { children: React.ReactNode }) {
  const T = useT();
  return <div style={{ fontSize: 12, color: T.text2, marginBottom: 6, fontWeight: 500 }}>{children}</div>;
}
