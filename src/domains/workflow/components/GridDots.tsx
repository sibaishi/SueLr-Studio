import { useViewport } from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';

interface GridDotsProps {
  gap: number;
  size: number;
  hoverSize: number;
  color: string;
  glowColor: string;
  glowRadius: number;
  containerWidth: number;
  containerHeight: number;
  mouseFlowPos: { x: number; y: number } | null;
  fadeOut: number;
}

/** Resolve a CSS custom property (var(--xxx)) to its computed value. */
function resolveColor(raw: string): string {
  if (raw.startsWith('var(')) {
    const varName = raw.slice(4, -1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || raw;
  }
  return raw;
}

export function GridDots({
  gap,
  size,
  hoverSize,
  color,
  glowColor,
  glowRadius,
  containerWidth,
  containerHeight,
  mouseFlowPos,
  fadeOut,
}: GridDotsProps) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  // layer 1: static baseline grid — only recalculated when viewport changes
  const baseDots = useMemo(() => {
    if (!containerWidth || !containerHeight) return [];

    const visibleLeft = -vpX / zoom - gap;
    const visibleTop = -vpY / zoom - gap;
    const visibleRight = visibleLeft + containerWidth / zoom + gap * 2;
    const visibleBottom = visibleTop + containerHeight / zoom + gap * 2;

    const startX = Math.floor(visibleLeft / gap) * gap;
    const startY = Math.floor(visibleTop / gap) * gap;
    const endX = Math.ceil(visibleRight / gap) * gap;
    const endY = Math.ceil(visibleBottom / gap) * gap;

    const result: Array<{ x: number; y: number }> = [];
    for (let gx = startX; gx <= endX; gx += gap) {
      for (let gy = startY; gy <= endY; gy += gap) {
        result.push({ x: gx, y: gy });
      }
    }
    return result;
  }, [vpX, vpY, zoom, gap, containerWidth, containerHeight]);

  // layer 2: glow overlay — dots within glow radius, affected by fadeOut
  const glowDots = useMemo(() => {
    if (!containerWidth || !containerHeight || !mouseFlowPos || fadeOut >= 1) return [];

    const glowInFlow = glowRadius / zoom;
    const visibleLeft = -vpX / zoom - gap;
    const visibleTop = -vpY / zoom - gap;
    const visibleRight = visibleLeft + containerWidth / zoom + gap * 2;
    const visibleBottom = visibleTop + containerHeight / zoom + gap * 2;

    const startX = Math.floor(visibleLeft / gap) * gap;
    const startY = Math.floor(visibleTop / gap) * gap;
    const endX = Math.ceil(visibleRight / gap) * gap;
    const endY = Math.ceil(visibleBottom / gap) * gap;

    const result: Array<{
      x: number;
      y: number;
      r: number;
      opacity: number;
    }> = [];

    for (let gx = startX; gx <= endX; gx += gap) {
      for (let gy = startY; gy <= endY; gy += gap) {
        const dist = Math.hypot(gx - mouseFlowPos.x, gy - mouseFlowPos.y);
        if (dist >= glowInFlow) continue;

        const t = 1 - dist / glowInFlow;
        const intensity = t * (1 - fadeOut);
        if (intensity <= 0.01) continue;

        result.push({
          x: gx,
          y: gy,
          r: size + (hoverSize - size) * intensity,
          opacity: intensity,
        });
      }
    }

    return result;
  }, [vpX, vpY, zoom, gap, size, hoverSize, glowRadius, containerWidth, containerHeight, mouseFlowPos, fadeOut]);

  // Draw everything on canvas — throttled via rAF so we never paint more than once per frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerWidth || !containerHeight) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;

      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(containerWidth * dpr);
      const h = Math.round(containerHeight * dpr);

      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, containerWidth, containerHeight);

      // Apply viewport transform so dots use flow coordinates
      ctx.save();
      ctx.translate(vpX, vpY);
      ctx.scale(zoom, zoom);

      // Layer 1: baseline dots
      const dotColor = resolveColor(color);
      ctx.fillStyle = dotColor;
      for (let i = 0; i < baseDots.length; i++) {
        const d = baseDots[i];
        ctx.beginPath();
        ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Layer 2: glow dots with shadow blur for the halo
      if (glowDots.length > 0) {
        const resolvedGlow = resolveColor(glowColor);
        ctx.shadowColor = resolvedGlow;
        ctx.shadowBlur = 4;
        for (let i = 0; i < glowDots.length; i++) {
          const d = glowDots[i];
          ctx.globalAlpha = d.opacity;
          ctx.fillStyle = resolvedGlow;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Reset
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [baseDots, glowDots, color, glowColor, size, vpX, vpY, zoom, containerWidth, containerHeight]);

  if (!containerWidth || !containerHeight) return null;

  return (
    <canvas
      ref={canvasRef}
      className="workflow-grid-dots"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: containerWidth,
        height: containerHeight,
      }}
    />
  );
}
