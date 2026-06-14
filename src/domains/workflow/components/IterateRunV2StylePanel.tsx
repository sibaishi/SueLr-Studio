import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { useCallback, useRef, useState } from 'react';

export default function IterateRunV2StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const v2Node = nodes.find((n) => n.selected && n.type === 'iterateRunV2');

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
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '20px 0',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--t-text3)' }}>
          已连接 {connectedEdges.length} 个文本输入
        </span>
        <span style={{ fontSize: 11, color: 'var(--t-text5)' }}>
          逐项运行时，下游节点将逐条处理
        </span>
      </div>
    </div>
  );
}
