import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { Image } from 'lucide-react';
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

  const hasImage = outputImages.length > 0;

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      {/* Gallery Frame */}
      <div className="node-gallery-frame-v2">
        {hasImage ? (
          <img
            src={outputImages[0]}
            alt=""
            className="node-gallery-image-v2"
            onClick={() => setPreviewImage(outputImages[0])}
          />
        ) : (
          <div className="node-gallery-empty-v2">
            <Image size={32} strokeWidth={1.2} />
            <span>待生成</span>
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
