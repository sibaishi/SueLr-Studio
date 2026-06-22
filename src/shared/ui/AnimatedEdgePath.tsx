import { BaseEdge, type EdgeProps } from '@xyflow/react';

export type AnimatedEdgePathData = {
  duration?: number;
  spacing?: number;
  shape?: 'circle' | 'box' | 'diamond';
  color?: string;
  size?: number;
};

type AnimatedEdgePathProps = Pick<EdgeProps, 'id' | 'style' | 'markerEnd'> & {
  path: string;
  data?: AnimatedEdgePathData;
  glowPrefix: string;
};

const shapeRenderers: Record<
  NonNullable<AnimatedEdgePathData['shape']>,
  (size: number, color: string) => React.JSX.Element
> = {
  circle: (size, color) => <circle r={size / 2} fill={color} />,
  box: (size, color) => <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={2} fill={color} />,
  diamond: (size, color) => {
    const radius = size / 2;
    return <polygon points={`0,${-radius} ${radius},0 0,${radius} ${-radius},0`} fill={color} />;
  },
};

export function getAnimatedEdgeTiming(duration: number, spacing: number) {
  const count = Math.max(2, Math.ceil(duration / spacing - 0.001));
  return { count, step: duration / count };
}

export function AnimatedEdgePath({ id, path, data, style, markerEnd, glowPrefix }: AnimatedEdgePathProps) {
  const duration = data?.duration ?? 2;
  const spacing = data?.spacing ?? 0.35;
  const shape = data?.shape ?? 'circle';
  const color = data?.color ?? 'var(--t-blue, #0a84ff)';
  const size = data?.size ?? 8;
  const { count, step } = getAnimatedEdgeTiming(duration, spacing);
  const glowId = `${glowPrefix}-${id}`;
  const renderShape = shapeRenderers[shape] ?? shapeRenderers.circle;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <defs>
        <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.45} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {Array.from({ length: count }, (_, index) => (
        <g key={index} filter={`url(#${glowId})`}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`-${(index * step).toFixed(2)}s`}
            path={path}
          />
          {renderShape(size, color)}
        </g>
      ))}
    </>
  );
}
