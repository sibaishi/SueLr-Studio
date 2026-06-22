import { useViewport } from '@xyflow/react';
import { useMemo } from 'react';

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

  // layer 1: static baseline grid — never changes
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

  // layer 2: glow overlay — only dots within glow radius, affected by fadeOut
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

  if (!containerWidth || !containerHeight) return null;

  return (
    <svg
      className="workflow-grid-dots"
      viewBox={`0 0 ${containerWidth} ${containerHeight}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: containerWidth,
        height: containerHeight,
      }}
    >
      <defs>
        <filter id="grid-dot-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${vpX}, ${vpY}) scale(${zoom})`}>
        {/* layer 1: baseline — always present */}
        {baseDots.map((dot, i) => (
          <circle key={`b-${i}`} cx={dot.x} cy={dot.y} r={size} fill={color} opacity={1} />
        ))}

        {/* layer 2: glow overlay — only when active, with SVG blur glow + screen blend */}
        <g style={{ mixBlendMode: 'screen' }}>
        {glowDots.map((dot, i) => (
          <circle
            key={`g-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={glowColor}
            opacity={dot.opacity}
            filter="url(#grid-dot-glow)"
          />
        ))}
        </g>
      </g>
    </svg>
  );
}
