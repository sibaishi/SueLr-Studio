import { AnimatedEdgePath, type AnimatedEdgePathData } from '@/shared/ui/AnimatedEdgePath';
import { type Edge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

/* ------------------------------------------------------------------ */
/*  AnimatedSvgSmoothStepEdge — smooth-step edge with moving shapes   */
/*  via SVG <animateMotion>. Use for data-flow or execution cues.     */
/* ------------------------------------------------------------------ */

export type AnimatedSvgSmoothStepEdgeData = AnimatedEdgePathData & {
  /** Corner radius for smooth-step bends (default 8) */
  borderRadius?: number;
  /** Offset from source/target before first bend (default 20) */
  offset?: number;
};

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

  return (
    <AnimatedEdgePath id={id} path={edgePath} data={d} style={style} markerEnd={markerEnd} glowPrefix="asse-glow" />
  );
}

AnimatedSvgSmoothStepEdge.displayName = 'AnimatedSvgSmoothStepEdge';
