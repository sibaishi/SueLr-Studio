import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { useCallback, useRef, useState } from 'react';

export default function IterateImageRunV2StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const v2Node = nodes.find((n) => n.selected && n.type === 'iterateImageRunV2');

  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(150);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startY: e.clientY, startH: height };
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        setHeight(
          Math.max(150, Math.min(300, dragRef.current.startH + delta))
        );
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [height]
  );

  if (!v2Node) return null;

  const connectedEdges = edges.filter((e) => e.target === v2Node.id);

  // Gather source node output images
  const sourceImageUrls: string[] = [];
  for (const edge of connectedEdges) {
    const sourceOutputs = nodeOutputs[edge.source];
    if (sourceOutputs) {
      const imgs: unknown = sourceOutputs['images'];
      if (Array.isArray(imgs)) {
        for (const img of imgs) {
          if (typeof img === 'string') sourceImageUrls.push(img);
        }
      }
    }
  }

  return (
    <div
      ref={panelRef}
      className="nodrag"
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 640,
        width: 'calc(100% - 44px)',
        height,
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        gap: 10,
        borderRadius: 25,
        background: 'var(--t-card)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--t-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 30,
        cursor: 'ns-resize',
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientY - rect.top <= 12) onDragStart(e);
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          overflow: 'auto',
          padding: '16px 12px',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--t-text3)' }}>
          已连接 {connectedEdges.length} 个图像输入
        </span>
        {sourceImageUrls.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              justifyContent: 'center',
            }}
          >
            {sourceImageUrls.slice(0, 12).map((url, idx) => (
              <img
                key={`${url}-${idx}`}
                src={url}
                alt={`源图 ${idx + 1}`}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 10,
                  objectFit: 'cover',
                  border: '1px solid var(--t-border)',
                }}
              />
            ))}
            {sourceImageUrls.length > 12 && (
              <span style={{ fontSize: 11, color: 'var(--t-text5)', alignSelf: 'center' }}>
                +{sourceImageUrls.length - 12}
              </span>
            )}
          </div>
        )}
        <span style={{ fontSize: 11, color: 'var(--t-text5)' }}>
          逐项运行时，下游节点将逐张处理
        </span>
      </div>
    </div>
  );
}
