import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { useState } from 'react';
import '../../node-v2.css';

interface ImageGenV2ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function ImageGenV2Content({
  params: _params,
  nodeId,
  data: _data,
  outerStyle,
  onChange: _onChange,
}: ImageGenV2ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Collect output images
  const outputImages: string[] = [];
  if (outputs) {
    const imagesValue = outputs.images;
    if (Array.isArray(imagesValue)) {
      outputImages.push(...imagesValue.filter((v): v is string => typeof v === 'string'));
    } else if (typeof imagesValue === 'string') {
      outputImages.push(imagesValue);
    }
  }

  return (
    <div className="node-content-shell-v2 node-settings-content-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      {/* Result display area */}
      {outputImages.length > 0 ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
          }}
        >
          <img
            src={outputImages[0]}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, cursor: 'pointer' }}
            onClick={() => setPreviewImage(outputImages[0])}
          />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--node-card-faint)',
            fontSize: 11,
          }}
        >
          待生成
        </div>
      )}

      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
