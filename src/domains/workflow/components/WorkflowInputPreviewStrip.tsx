import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';

export type WorkflowPreviewItem = {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  label: string;
  value: string;
  edgeId?: string;
};

export type WorkflowPreviewGroup = {
  sourceNodeId: string;
  sourceNodeLabel: string;
  items: WorkflowPreviewItem[];
};

export function WorkflowInputPreviewStrip({
  groups,
  typeOrder = ['text', 'image', 'video', 'audio'],
  adoptedItemIds,
}: {
  groups: Record<string, WorkflowPreviewGroup[]>;
  typeOrder?: readonly string[];
  adoptedItemIds?: Set<string>;
}) {
  const flatGroups = typeOrder.flatMap((type) => (groups[type] || []).map((group) => ({ type, group })));
  if (flatGroups.length === 0) return null;

  return (
    <div
      className="nodrag"
      style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap', cursor: 'default' }}
    >
      {flatGroups.map(({ type, group }) => (
        <div
          key={`${type}-${group.sourceNodeId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px 3px 4px',
            borderRadius: 10,
            background: 'var(--t-bg2)',
            border: '1px solid var(--t-border)',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)', flexShrink: 0 }}>
            {type === 'image'
              ? '图'
              : type === 'video'
                ? '视'
                : type === 'audio'
                  ? '音'
                  : type === 'text'
                    ? '文'
                    : type}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--t-text3)',
              whiteSpace: 'nowrap',
              maxWidth: 56,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 0,
            }}
          >
            {group.sourceNodeLabel}
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {group.items.map((item) => {
              const adopted = !adoptedItemIds || adoptedItemIds.has(item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'var(--t-bg)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: adopted
                      ? '1px solid var(--t-border)'
                      : '1px solid color-mix(in srgb, #AF52DE 70%, var(--t-border))',
                    opacity: adopted ? 1 : 0.28,
                  }}
                  title={adopted ? (item.type === 'text' ? item.value : item.label) : '当前素材类型下忽略'}
                >
                  {(item.type === 'image' || item.type === 'video') && item.value ? (
                    <img
                      src={inferImageThumbnailUrl(item.value) || item.value}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : item.type === 'text' ? (
                    <span
                      style={{
                        fontSize: 8,
                        lineHeight: 1.2,
                        color: 'var(--t-text2)',
                        padding: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {item.value.slice(0, 30)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)' }}>
                      {item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '?'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
