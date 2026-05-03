import { useEffect, useState } from 'react';

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Failed to load image dimensions'));
    image.src = src;
  });
}

export function useImageDimensions(src: string) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDimensions(null);

    void readImageDimensions(src)
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
}: {
  src: string;
  className?: string;
}) {
  const dimensions = useImageDimensions(src);
  if (!dimensions) return null;

  return (
    <span className={className}>
      {dimensions.width} x {dimensions.height}
    </span>
  );
}
