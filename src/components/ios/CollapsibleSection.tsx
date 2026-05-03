import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';

export function CollapsibleSection({ title, count, defaultOpen = true, children, extra }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode; extra?: React.ReactNode }) {
  const T = useT();
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(open ? 9999 : 0);
  useEffect(() => { if (open) setMaxH(9999); else setMaxH(0); }, [open]);
  useEffect(() => { if (open && contentRef.current) setMaxH(9999); const ob = new ResizeObserver(() => { if (open) setMaxH(9999); }); if (contentRef.current) ob.observe(contentRef.current); return () => ob.disconnect(); }, [open]);
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
          {count !== undefined && <span style={{ fontSize: 10, color: T.text3, background: T.card2, padding: '2px 8px', borderRadius: 8 }}>{count}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extra}
          <ChevronDown size={12} color={T.text3} style={{ transition: 'transform 0.25s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }} />
        </div>
      </div>
      <div style={{ maxHeight: maxH, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
        <div ref={contentRef} style={{ padding: '0 16px 12px' }}>{children}</div>
      </div>
    </div>
  );
}
