import { type PointerEvent, useEffect, useRef, useState } from 'react';

type WindowBounds = { x: number; y: number; width: number; height: number };
export const agentResizeEdges = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
type ResizeEdge = (typeof agentResizeEdges)[number];
const margin = 12;
const minWidth = 320;
const minHeight = 280;

function constrain(bounds: WindowBounds): WindowBounds {
  const availableWidth = Math.max(1, window.innerWidth - margin * 2);
  const availableHeight = Math.max(1, window.innerHeight - margin * 2);
  const width = Math.min(availableWidth, Math.max(minWidth, bounds.width));
  const height = Math.min(availableHeight, Math.max(minHeight, bounds.height));
  return {
    width,
    height,
    x: Math.max(margin, Math.min(bounds.x, window.innerWidth - margin - width)),
    y: Math.max(margin, Math.min(bounds.y, window.innerHeight - margin - height)),
  };
}

export function useAgentWindow() {
  const panel = useRef<HTMLElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; bounds: WindowBounds; edge?: ResizeEdge } | null>(
    null,
  );
  const [bounds, setBounds] = useState<WindowBounds>();
  useEffect(() => {
    const fit = () => setBounds((current) => current && constrain(current));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  function place() {
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    setBounds((current) =>
      constrain(
        current ?? {
          x: rect.right - Math.max(rect.width, 380),
          y: rect.top,
          width: Math.max(rect.width, 380),
          height: rect.height,
        },
      ),
    );
  }

  function begin(event: PointerEvent<HTMLElement>, edge?: ResizeEdge) {
    if (!bounds || event.button !== 0 || gesture.current) return;
    if (!edge && event.target instanceof Element && event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, bounds, edge };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const base = start.bounds;
    if (!start.edge) {
      setBounds(constrain({ ...base, x: base.x + dx, y: base.y + dy }));
      return;
    }
    const edge = start.edge;
    const right = base.x + base.width;
    const bottom = base.y + base.height;
    const x = edge.includes('w') ? Math.max(margin, Math.min(base.x + dx, right - minWidth)) : base.x;
    const y = edge.includes('n') ? Math.max(margin, Math.min(base.y + dy, bottom - minHeight)) : base.y;
    const nextRight = edge.includes('e')
      ? Math.min(window.innerWidth - margin, Math.max(right + dx, x + minWidth))
      : right;
    const nextBottom = edge.includes('s')
      ? Math.min(window.innerHeight - margin, Math.max(bottom + dy, y + minHeight))
      : bottom;
    setBounds(constrain({ x, y, width: nextRight - x, height: nextBottom - y }));
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
  }

  return { panel, bounds, place, begin, move, end };
}
