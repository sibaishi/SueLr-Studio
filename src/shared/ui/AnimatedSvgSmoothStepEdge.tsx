import { BaseEdge, type Edge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

/* ------------------------------------------------------------------ */
/*  AnimatedSvgSmoothStepEdge — smooth-step edge with moving shapes   */
/*  via SVG <animateMotion>. Use for data-flow or execution cues.     */
/* ------------------------------------------------------------------ */

export type AnimatedSvgSmoothStepEdgeData = {
  /** Animation duration in seconds (default 2) */
  duration?: number;
  /** Spacing between dots in seconds (default 0.35) */
  spacing?: number;
  /** SVG shape key  */
  shape?: 'circle' | 'box' | 'diamond';
  /** Color of the moving element (default: accent blue) */
  color?: string;
  /** Size of the moving element in px (default 8) */
  size?: number;
  /** Corner radius for smooth-step bends (default 8) */
  borderRadius?: number;
  /** Offset from source/target before first bend (default 20) */
  offset?: number;
};

/* ----- built-in shape renderers (glow is handled by SVG filter) ----- */

const circleBase = (size: number, color: string) => <circle r={size / 2} fill={color} />;

const boxBase = (size: number, color: string) => (
  <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={2} fill={color} />
);

const diamondBase = (size: number, color: string) => {
  const s = size / 2;
  return <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} fill={color} />;
};

const shapeMap: Record<string, (size: number, color: string) => React.JSX.Element> = {
  circle: circleBase,
  box: boxBase,
  diamond: diamondBase,
};

/* ------------------------------------------------------------------ */

/** Edge type descriptor used when registering this edge. */
export type AnimatedSvgSmoothStepEdgeType = Edge<AnimatedSvgSmoothStepEdgeData, 'animatedSvgSmoothstep'>;

export function AnimatedSvgSmoothStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const d = data as AnimatedSvgSmoothStepEdgeData | undefined;
  const borderRadius = d?.borderRadius ?? 15;
  const offset = d?.offset ?? 20;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius,
    offset,
  });

  const duration = d?.duration ?? 2;
  const spacing = d?.spacing ?? 0.35;
  const shape = d?.shape ?? 'circle';
  const color = d?.color ?? 'var(--t-blue, #0a84ff)';
  const size = d?.size ?? 8;

  const rawCount = duration / spacing;
  const count = Math.max(2, Math.ceil(rawCount - 0.001));
  const step = duration / count;
  const glowId = `asse-glow-${id}`;
  const renderer = shapeMap[shape] ?? circleBase;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      <defs>
        <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.45} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from({ length: count }, (_, i) => (
        <g key={i} filter={`url(#${glowId})`}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`-${(i * step).toFixed(2)}s`}
            path={edgePath}
          />
          {renderer(size, color)}
        </g>
      ))}
    </>
  );
}

AnimatedSvgSmoothStepEdge.displayName = 'AnimatedSvgSmoothStepEdge';
