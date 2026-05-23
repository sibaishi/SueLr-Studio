import { Bot } from 'lucide-react';
import { useT } from '@/providers/ThemeContext';
import { glass } from './glass';

export function TypingIndicator() {
  const T = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <div style={{ width: 28, height: 28, borderRadius: 14, ...glass(0.08), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bot size={14} color={T.blue} /></div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: T.text3, animation: `dotBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}
      </div>
    </div>
  );
}
