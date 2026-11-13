import { type PointerEvent, useEffect, useRef, useState } from 'react';

type WindowBounds = { x: number; y: number; width: number; height: number };
const margin = 12;

function constrain(bounds: WindowBounds): WindowBounds {
  const availableWidth = Math.max(1, window.innerWidth - margin * 2);
  const availableHeight = Math.max(1, window.innerHeight - margin * 2);
  const width = Math.min(availableWidth, Math.max(320, bounds.width));
  const height = Math.min(availableHeight, Math.max(280, bounds.height));
  return {
    width,
    height,
    x: Math.max(margin, Math.min(bounds.x, window.innerWidth - margin - width)),
    y: Math.max(margin, Math.min(bounds.y, window.innerHeight - margin - height)),
  };
}

export function useAgentWindow() {
  const panel = useRef<HTMLElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; bounds: WindowBounds; resize: boolean } | null>(
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

  function begin(event: PointerEvent<HTMLElement>, resize = false) {
    if (!bounds || event.button !== 0 || gesture.current) return;
    if (!resize && event.target instanceof Element && event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, bounds, resize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const base = start.bounds;
    setBounds(
      constrain(
        start.resize
          ? {
              ...base,
              width: Math.min(base.width + dx, window.innerWidth - margin - base.x),
              height: Math.min(base.height + dy, window.innerHeight - margin - base.y),
            }
          : { ...base, x: base.x + dx, y: base.y + dy },
      ),
    );
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
  }

  return { panel, bounds, place, begin, move, end };
}
