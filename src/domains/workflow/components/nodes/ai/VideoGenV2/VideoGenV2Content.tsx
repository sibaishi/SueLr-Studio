import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Clapperboard } from 'lucide-react';
import '../../node-v2.css';

interface VideoGenV2ContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

export function VideoGenV2Content({
  params: _params,
  nodeId,
  data: _data,
  outerStyle,
  onChange: _onChange,
}: VideoGenV2ContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;

  const videoUrl = typeof outputs?.video === 'string' ? outputs.video : null;
  const hasVideo = Boolean(videoUrl);

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2">
        {hasVideo ? (
          <video
            src={videoUrl!}
            controls
            className="node-gallery-video-v2"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
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
