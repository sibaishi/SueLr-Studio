export function NodeCardMaterialPreview({
  images,
  texts,
  onOpenImage,
  onOpenText,
}: {
  images: string[];
  texts: string[];
  onOpenImage?: (index: number) => void;
  onOpenText?: (index: number) => void;
}) {
  return (
    <>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {images.map((image, index) => (
            <div
              key={`${image}/${index}`}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--node-card-bg-soft)',
                cursor: onOpenImage ? 'pointer' : 'default',
                border: '1px solid var(--node-card-line)',
              }}
              title={onOpenImage ? '双击全屏查看' : undefined}
              onDoubleClick={() => onOpenImage?.(index)}
            >
              <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}

      {texts.map((text, index) => (
        <div
          key={`${text}/${index}`}
          onDoubleClick={() => onOpenText?.(index)}
          style={{
            fontSize: 10,
            lineHeight: 1.5,
            color: 'var(--node-card-ink)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            cursor: onOpenText ? 'pointer' : 'default',
            padding: '4px 6px',
            borderRadius: 6,
            border: '1px solid transparent',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--node-card-bg-soft)';
            event.currentTarget.style.borderColor = 'var(--node-card-line)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = '';
            event.currentTarget.style.borderColor = 'transparent';
          }}
        >
          {text}
        </div>
      ))}
    </>
  );
}
