import { useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';

export function ImageCompareContent({
  outputs,
  outerStyle,
}: {
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
}) {
  const [position, setPosition] = useState(50);
  const image1 = typeof outputs?.image1 === 'string' ? outputs.image1 : '';
  const image2 = typeof outputs?.image2 === 'string' ? outputs.image2 : '';
  const ready = Boolean(image1 && image2);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPosition = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, nextPosition)));
  };

  if (!ready) {
    return (
      <div className="node-content-shell node-image-compare node-image-compare--empty" style={outerStyle}>
        <span>运行后展示两张图片的对比预览</span>
      </div>
    );
  }

  return (
    <div className="node-content-shell node-image-compare" style={outerStyle}>
      <div
        className="node-image-compare__viewport nodrag"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPosition(50)}
        style={{ '--compare-position': `${position}%` } as CSSProperties}
      >
        <div className="node-image-compare__pane node-image-compare__pane--left">
          <img className="node-image-compare__image" src={image1} alt="图片1" draggable={false} />
        </div>
        <div className="node-image-compare__pane node-image-compare__pane--right">
          <img className="node-image-compare__image" src={image2} alt="图片2" draggable={false} />
        </div>
        <div className="node-image-compare__divider" aria-hidden="true" />
        <div className="node-image-compare__labels" aria-hidden="true">
          <span>图片1</span>
          <span>图片2</span>
        </div>
      </div>
    </div>
  );
}
