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

  const dots = useMemo(() => {
    if (!containerWidth || !containerHeight) return [];

    const visibleLeft = -vpX / zoom - gap;
    const visibleTop = -vpY / zoom - gap;
    const visibleRight = visibleLeft + containerWidth / zoom + gap * 2;
    const visibleBottom = visibleTop + containerHeight / zoom + gap * 2;

    const startX = Math.floor(visibleLeft / gap) * gap;
    const startY = Math.floor(visibleTop / gap) * gap;
    const endX = Math.ceil(visibleRight / gap) * gap;
    const endY = Math.ceil(visibleBottom / gap) * gap;

    const glowInFlow = glowRadius / zoom;

    const result: Array<{
      x: number;
      y: number;
      r: number;
      fill: string;
      opacity: number;
    }> = [];

    for (let gx = startX; gx <= endX; gx += gap) {
      for (let gy = startY; gy <= endY; gy += gap) {
        if (!mouseFlowPos) {
          result.push({ x: gx, y: gy, r: size, fill: color, opacity: 1 });
          continue;
        }

        const dist = Math.hypot(gx - mouseFlowPos.x, gy - mouseFlowPos.y);
        const rawT = 1 - dist / glowInFlow;
        const glowIntensity = Math.max(0, rawT) * (1 - fadeOut);

        if (glowIntensity <= 0.01) {
          result.push({ x: gx, y: gy, r: size, fill: color, opacity: 1 });
        } else {
          result.push({
            x: gx,
            y: gy,
            r: size + (hoverSize - size) * glowIntensity,
            fill: glowColor,
            opacity: glowIntensity,
          });
        }
      }
    }

    return result;
  }, [
    vpX,
    vpY,
    zoom,
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
  ]);

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
      <g transform={`translate(${vpX}, ${vpY}) scale(${zoom})`}>
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={dot.fill}
            opacity={dot.opacity}
            className={
              dot.fill === glowColor ? 'workflow-grid-dot--glow' : undefined
            }
          />
        ))}
      </g>
    </svg>
  );
}
