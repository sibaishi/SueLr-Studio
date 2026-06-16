import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { Bot, Clapperboard, Image } from 'lucide-react';
import { useState } from 'react';
import '../../node-v2.css';

interface AiV3ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function AiV3Content({
  params: _params,
  nodeId,
  data,
  outerStyle,
  onChange: _onChange,
}: AiV3ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const mode = (data.mode as string) || 'chat';

  if (mode === 'image') {
    const outputImages: string[] = [];
    if (outputs) {
      const v = (outputs as Record<string, unknown>).result || outputs.images;
      if (Array.isArray(v)) outputImages.push(...v.filter((x): x is string => typeof x === 'string'));
      else if (typeof v === 'string') outputImages.push(v);
    }
    const hasImage = outputImages.length > 0;
    return (
      <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
        <div className="node-gallery-frame-v2">
          {hasImage ? (
            <img src={outputImages[0]} alt="" className="node-gallery-image-v2" onClick={() => setPreviewImage(outputImages[0])} />
          ) : (
            <div className="node-gallery-empty-v2">
              <Image size={32} strokeWidth={1.2} />
              <span>待生成</span>
            </div>
          )}
        </div>
        {previewImage && (
          <ImagePreviewModal
            src={previewImage}
            images={outputImages.map((image) => ({ src: image }))}
            initialIndex={Math.max(0, outputImages.indexOf(previewImage))}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </div>
    );
  }

  if (mode === 'video') {
    const videoUrl = typeof (outputs as Record<string, unknown>)?.result === 'string' ? (outputs as Record<string, unknown>).result as string : typeof outputs?.video === 'string' ? outputs.video : null;
    return (
      <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
        <div className="node-gallery-frame-v2">
          {videoUrl ? (
            <video src={videoUrl} controls className="node-gallery-video-v2" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div className="node-gallery-empty-v2">
              <Clapperboard size={32} strokeWidth={1.2} />
              <span>待生成</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // chat (default)
  const response = typeof (outputs as Record<string, unknown>)?.result === 'string' ? (outputs as Record<string, unknown>).result as string : typeof outputs?.response === 'string' ? outputs.response : null;
  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2" style={{ padding: 10 }}>
        {response ? (
          <div
            className="node-chat-response-v2"
            style={{ width: '100%', fontSize: 11, lineHeight: 1.6, color: 'var(--node-card-ink)', overflow: 'auto', height: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {response}
          </div>
        ) : (
          <div className="node-gallery-empty-v2">
            <Bot size={32} strokeWidth={1.2} />
            <span>待生成</span>
          </div>
        )}
      </div>
    </div>
  );
}
