import { useWorkflowStore } from '@/domains/workflow/lib/store';

export default function IterateImageRunV2StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const v2Node = nodes.find((n) => n.selected && n.type === 'iterateImageRunV2');

  if (!v2Node) return null;

  const connectedEdges = edges.filter((e) => e.target === v2Node.id);

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
          gap: 8,
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--t-text3)' }}>
          已连接 {connectedEdges.length} 个图像输入
        </span>
        {sourceImageUrls.length > 0 && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {sourceImageUrls.slice(0, 5).map((url, idx) => (
              <img
                key={`${url}-${idx}`}
                src={url}
                alt={`源图 ${idx + 1}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  objectFit: 'cover',
                  border: '1px solid var(--t-border)',
                }}
              />
            ))}
            {sourceImageUrls.length > 5 && (
              <span style={{ fontSize: 10, color: 'var(--t-text5)' }}>
                +{sourceImageUrls.length - 5}
              </span>
            )}
          </div>
        )}
        <span style={{ fontSize: 10, color: 'var(--t-text5)' }}>
          · 下游逐张处理
        </span>
      </div>
    </div>
  );
}
