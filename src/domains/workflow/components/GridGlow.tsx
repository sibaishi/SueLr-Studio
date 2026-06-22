interface GridGlowProps {
  radius: number;
  containerWidth: number;
  containerHeight: number;
  mouseScreenPos: { x: number; y: number } | null;
  fadeOut: number;
}

export function GridGlow({
  radius,
  containerWidth,
  containerHeight,
  mouseScreenPos,
  fadeOut,
}: GridGlowProps) {
  if (!mouseScreenPos || !containerWidth || !containerHeight) return null;

  const alpha = 1 - fadeOut;
  if (alpha <= 0) return null;

  return (
    <div
      className="workflow-grid-glow-halo"
      style={{
        position: 'absolute',
        left: mouseScreenPos.x,
        top: mouseScreenPos.y,
        width: radius * 2,
        height: radius * 2,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        pointerEvents: 'none',
        opacity: alpha * 0.55,
        background: `radial-gradient(circle, rgba(10,132,255,0.18) 0%, rgba(10,132,255,0.06) 40%, transparent 70%)`,
      }}
    />
  );
}
