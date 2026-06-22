import { readWorkflowImageDimensions } from '@/domains/workflow/lib/browserImage';
import { useEffect, useState } from 'react';

export function useImageDimensions(src: string) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDimensions(null);

    void readWorkflowImageDimensions(src)
      .then((nextDimensions) => {
        if (!cancelled) setDimensions(nextDimensions);
      })
      .catch(() => {
        if (!cancelled) setDimensions(null);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return dimensions;
}

export function ImageSizeLabel({
  src,
  className = '',
  dimensionSrc,
  width,
  height,
}: {
  src: string;
  className?: string;
  dimensionSrc?: string;
  width?: number;
  height?: number;
}) {
  if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
    return (
      <span className={className}>
        {width} x {height}
      </span>
    );
  }

  const dimensions = useImageDimensions(dimensionSrc || src);
  if (!dimensions) return null;

  return (
    <span className={className}>
      {dimensions.width} x {dimensions.height}
    </span>
  );
}
