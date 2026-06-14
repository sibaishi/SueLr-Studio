import { useWorkflowStore } from '@/domains/workflow/lib/store';

export default function IterateRunV2StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const v2Node = nodes.find((n) => n.selected && n.type === 'iterateRunV2');

  if (!v2Node) return null;

  const connectedEdges = edges.filter((e) => e.target === v2Node.id);

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 640,
        width: 'calc(100% - 44px)',
        height: 50,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 12px',
        gap: 0,
        borderRadius: 25,
        background: 'var(--t-card)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--t-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 30,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--t-text3)' }}>
          已连接 {connectedEdges.length} 个文本输入
        </span>
        <span style={{ fontSize: 10, color: 'var(--t-text5)' }}>
          · 下游逐条处理
        </span>
      </div>
    </div>
  );
}
