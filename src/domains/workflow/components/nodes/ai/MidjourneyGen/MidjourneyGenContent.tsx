import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Image } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import '../../node-v2.css';

interface MidjourneyGenContentProps {
  nodeId?: string;
  outerStyle: CSSProperties;
}

function collectImageUrls(value: unknown, result: string[]) {
  if (typeof value === 'string') {
    if (/^(data:image\/|blob:|https?:\/\/|\/api\/)/i.test(value)) result.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, result);
  }
}

export function MidjourneyGenContent({ nodeId, outerStyle }: MidjourneyGenContentProps) {
  const outputs = useWorkflowStore((state) => (nodeId ? state.nodeOutputs[nodeId] : undefined));
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const images = useMemo(() => {
    const result: string[] = [];
    if (!outputs) return result;
    collectImageUrls((outputs as Record<string, unknown>).result, result);
    return [...new Set(result)];
  }, [outputs]);

  const meta = outputs && typeof outputs.meta === 'object' && outputs.meta
    ? outputs.meta as Record<string, unknown>
    : undefined;
  const task = meta && typeof meta.task === 'object' && meta.task
    ? meta.task as Record<string, unknown>
    : undefined;
  const progress = typeof task?.progress === 'string' ? task.progress : '';
  const jobId = typeof task?.jobId === 'string' ? task.jobId : '';

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div className="node-gallery-frame-v2">
        {images.length > 0 ? (
          <img
            src={images[0]}
            alt=""
            className="node-gallery-image-v2"
            onClick={() => setPreviewImage(images[0])}
          />
        ) : (
          <div className="node-gallery-empty-v2">
            <Image size={32} strokeWidth={1.2} />
            <span>{progress ? `生成中 ${progress}` : '待生成'}</span>
            {jobId && <small title={jobId}>任务已提交</small>}
          </div>
        )}
      </div>
      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          images={images.map((image) => ({ src: image }))}
          initialIndex={Math.max(0, images.indexOf(previewImage))}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
