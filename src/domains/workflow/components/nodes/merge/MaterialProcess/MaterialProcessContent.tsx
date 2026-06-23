import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Stack } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { NodeCardMaterialPreview } from '../../NodeCardMaterialPreview';
import '../../node-v2.css';
import {
  type MaterialProcessInputItem,
  classifyMaterialProcessValue,
  filterMaterialProcessItems,
  resolveMaterialProcessInputItems,
} from './materialProcessInputs';

function collectOutputItems(value: unknown): MaterialProcessInputItem[] {
  const values = Array.isArray(value) ? value.flat(Number.POSITIVE_INFINITY) : value == null ? [] : [value];
  return values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item, index) => ({
      id: `result/${index}`,
      value: item,
      type: classifyMaterialProcessValue(item),
      sourceNodeId: '',
    }));
}

export function MaterialProcessContent({
  nodeId,
  data,
  outerStyle,
  outputs,
}: {
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  outputs?: Record<string, unknown>;
}) {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const nodeOutputs = useWorkflowStore((state) => state.nodeOutputs);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);
  const [previewTextIndex, setPreviewTextIndex] = useState<number | null>(null);

  const inputItems = useMemo(
    () => (nodeId ? resolveMaterialProcessInputItems(nodeId, nodes, edges, nodeOutputs) : []),
    [nodeId, nodes, edges, nodeOutputs],
  );
  const resultItems = useMemo(() => collectOutputItems(outputs?.result), [outputs?.result]);
  const items = resultItems.length > 0 ? resultItems : filterMaterialProcessItems(inputItems, data.materialType);
  const imageItems = items.filter((item) => item.type === 'image');
  const textItems = items.filter((item) => item.type === 'text');

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      <div
        className="node-gallery-frame-v2"
        style={{
          padding: items.length > 0 ? 8 : undefined,
          alignItems: items.length > 0 ? 'stretch' : undefined,
          justifyContent: items.length > 0 ? 'flex-start' : undefined,
          flexDirection: items.length > 0 ? 'column' : undefined,
          gap: 6,
          overflowY: 'auto',
        }}
      >
        {items.length === 0 ? (
          <div className="node-gallery-empty-v2">
            <Stack size={32} strokeWidth={1.2} />
            <span>待输入素材</span>
          </div>
        ) : (
          <NodeCardMaterialPreview
            images={imageItems.map((item) => item.value)}
            texts={textItems.map((item) => item.value)}
            onOpenImage={setPreviewImageIndex}
            onOpenText={setPreviewTextIndex}
          />
        )}
      </div>

      {previewImageIndex !== null && imageItems[previewImageIndex] && (
        <ImagePreviewModal
          src={imageItems[previewImageIndex].value}
          images={imageItems.map((item) => ({ src: item.value }))}
          initialIndex={previewImageIndex}
          onClose={() => setPreviewImageIndex(null)}
        />
      )}
      {previewTextIndex !== null && textItems[previewTextIndex] && (
        <ImagePreviewModal
          src=""
          textContent={textItems[previewTextIndex].value}
          title="文本预览"
          onClose={() => setPreviewTextIndex(null)}
        />
      )}
    </div>
  );
}
