import { AnimatedEdgePath, type AnimatedEdgePathData } from '@/shared/ui/AnimatedEdgePath';
import { type Edge, type EdgeProps, getBezierPath } from '@xyflow/react';

/* ------------------------------------------------------------------ */
/*  AnimatedSvgEdge — an edge that carries a moving shape via          */
/*  SVG <animateMotion>. Use for data-flow or execution visual cues.   */
/* ------------------------------------------------------------------ */

export type AnimatedSvgEdgeData = AnimatedEdgePathData;

/* ------------------------------------------------------------------ */

/** Edge type descriptor used when registering this edge. */
export type AnimatedSvgEdgeType = Edge<AnimatedSvgEdgeData, 'animatedSvg'>;

export function AnimatedSvgEdge({
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  return (
    <AnimatedEdgePath
      id={id}
      path={edgePath}
      data={data as AnimatedSvgEdgeData | undefined}
      style={style}
      markerEnd={markerEnd}
      glowPrefix="ase-glow"
    />
  );
}

AnimatedSvgEdge.displayName = 'AnimatedSvgEdge';
