import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Image } from 'lucide-react';
import '../../node-v2.css';

interface IterateImageRunV2ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function IterateImageRunV2Content({
  params: _params,
  nodeId,
  data: _data,
  outerStyle,
  onChange: _onChange,
}: IterateImageRunV2ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;

  const imageValue: unknown = outputs?.['images'];
  const imageUrls = Array.isArray(imageValue) ? imageValue as string[] : [];
  const hasImage = imageUrls.length > 0;

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2" style={{ padding: 3, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {hasImage ? (
          imageUrls.slice(0, 4).map((url, idx) => {
            const isLastSingle = imageUrls.length === 1 || (idx === 3 && imageUrls.length > 4);
            const style: CSSProperties = {
              width: imageUrls.length === 1 ? '100%' : 'calc(50% - 3px)',
              height: imageUrls.length === 1 ? '100%' : 'calc(50% - 3px)',
              borderRadius: 10,
              objectFit: 'cover',
              position: 'relative',
            };
            return (
              <div key={`${url}-${idx}`} style={{ ...style, background: 'var(--t-bg3)', position: 'relative' }}>
                <img
                  src={url}
                  alt={`逐项图片 ${idx + 1}`}
                  style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }}
                />
                {isLastSingle && imageUrls.length > 4 && (
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 10,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 14, fontWeight: 700,
                  }}>
                    +{imageUrls.length - 3}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="node-gallery-empty-v2" style={{ width: '100%' }}>
            <Image size={32} strokeWidth={1.2} />
            <span>待逐项运行</span>
          </div>
        )}
      </div>
    </div>
  );
}
