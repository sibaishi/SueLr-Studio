import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export function AnimatedFlowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const hasFlow = (data as Record<string, unknown> | undefined)?.flow === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          transition: 'stroke 180ms ease, stroke-width 180ms ease',
          stroke: hasFlow ? 'var(--color-accent)' : (style?.stroke || 'var(--color-text-tertiary)'),
          strokeWidth: hasFlow ? 2.5 : (style?.strokeWidth || 2),
        }}
        markerEnd={markerEnd}
      />
      {hasFlow && (
        <>
          <path d={edgePath} fill="none" stroke="var(--color-accent)" strokeWidth={8} strokeLinecap="round"
            style={{ strokeDasharray: '0 14', animation: 'dot-flow 0.8s linear infinite', opacity: 0.18, pointerEvents: 'none' }} />
          <path d={edgePath} fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round"
            style={{ strokeDasharray: '0 14', animation: 'dot-flow 0.8s linear infinite', opacity: 0.85, pointerEvents: 'none' }} />
        </>
      )}
    </>
  );
}

AnimatedFlowEdge.displayName = 'AnimatedFlowEdge';
