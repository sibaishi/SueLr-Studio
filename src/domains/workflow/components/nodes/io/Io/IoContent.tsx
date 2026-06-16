import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { expandAiV3InputSlots, type AiV3InputSlot } from '@/domains/workflow/lib/store/helpers';
import { fileRawStore } from '../fileRawStore';
import { createIoImageFileEntry, imageFileNameFromUrl, uploadIoImageFileEntry } from '@/domains/workflow/lib/ioImageFiles';
import { FileText, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import '../../node-v2.css';

interface IoContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

function classifyItemValue(value: unknown): 'image' | 'video' | 'audio' | 'text' {
  // Reject nested arrays before coercing to string (multiple upstream edges combine into one IO)
  if (Array.isArray(value)) return 'text';
  const str = String(value);
  if (str.startsWith('blob:')) {
    if (str.includes('/image/') || /\.(png|jpg|jpeg|gif|webp|avif)/i.test(str)) return 'image';
    if (str.includes('/video/') || /\.(mp4|webm|mov)/i.test(str)) return 'video';
    if (str.includes('/audio/') || /\.(mp3|wav|ogg)/i.test(str)) return 'audio';
    return 'image';
  }
  if (str.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(str)) return 'video';
  if (str.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(str)) return 'audio';
  if (str.startsWith('data:image/') || str.startsWith('http') || /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(str)) return 'image';
  return 'text';
}

/** Flatten nested arrays from multi-edge combined IO outputs into a flat string list */
function flattenNestedOutput(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      out.push(...flattenNestedOutput(item));
    } else {
      out.push(String(item));
    }
  }
  return out;
}

// Upstream items use expandIoInputSlots for type classification instead of classifyItemValue

export function IoContent({
  params: _params,
  nodeId,
  data,
  outerStyle,
  onChange: _onChange,
}: IoContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const outputs = nodeId ? nodeOutputs[nodeId] : undefined;
  const [previewIdx, setPreviewIdx] = useState<number>(-1);
  const [resizedSrcs, setResizedSrcs] = useState<Record<number, string>>({});

  // Compute upstream content from edges via slot expansion (same as AiV3 panel)
  const upstreamSlots = useMemo((): AiV3InputSlot[] | null => {
    if (!nodeId) return null;
    const upstreamEdges = edges.filter((e) => e.target === nodeId && e.targetHandle === 'input');
    if (upstreamEdges.length === 0) return null;
    const result = expandAiV3InputSlots(nodeId, edges, nodes);
    return result;
  }, [nodeId, edges, nodes]);

  // Source-mode content: combine text + file URLs, same as panel display
  const sourceContent = useMemo(() => {
    const text = data.text;
    const files = data.content;
    if (text && Array.isArray(files) && files.length > 0) return [text, ...files];
    if (Array.isArray(files) && files.length > 0) return files;
    if (text) return text;
    return null;
  }, [data.text, data.content]);

  // Resolve slot values (same logic as AiV3StylePanel input thumbnails)
  // Also handle data.content fallback: when upstream IO has file URLs but no _fileIds
  // (e.g., passthrough from execution output), classify those by URL pattern.
  const upstreamItems = useMemo(() => {
    if (!upstreamSlots) return null;

    const resolved = upstreamSlots.flatMap((slot) => {
      const src = nodes.find((n) => n.id === slot.sourceNodeId);
      const srcData = (src?.data || {}) as Record<string, unknown>;
      const srcOutputs = nodeOutputs[slot.sourceNodeId];

      const values: string[] = [];
      let type: string = slot.type;
      if (slot.sourceNodeType === 'io') {
        if (slot.type === 'text') {
          values.push(String(srcData.text || ''));
        } else if (slot.fileId !== undefined) {
          const content: string[] = Array.isArray(srcData.content) ? (srcData.content as string[]) : [];
          const fileIds: number[] = Array.isArray(srcData._fileIds) ? (srcData._fileIds as number[]) : [];
          const cIdx = fileIds.indexOf(slot.fileId);
          values.push((cIdx >= 0 ? content[cIdx] : '') || fileRawStore.getObjectUrl(slot.fileId) || '');
        }
      } else {
        const edge = edges.find((e) => e.id === slot.edgeId);
        const handle = edge?.sourceHandle || 'output';
        const directValue = String(srcData[handle] || '');
        if (directValue) {
          values.push(directValue);
        }
        if (values.length === 0) {
          for (const k of ['text', 'image', 'video', 'audio', 'value', 'fileUrl']) {
            const v = srcData[k];
            if (typeof v === 'string' && v) { values.push(v); break; }
          }
        }
        if (values.length === 0 && srcOutputs) {
          const collect = (value: unknown): string[] => {
            if (typeof value === 'string') return [value];
            if (Array.isArray(value)) return value.flatMap(collect);
            if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
              return [String((value as { url: string }).url)];
            }
            return [];
          };
          const handleValues = collect(srcOutputs[handle]);
          const outputValues = handleValues.length > 0 ? handleValues : Object.values(srcOutputs).flatMap(collect);
          values.push(...outputValues);
        }
      }

      return values
        .filter(Boolean)
        .map((value, valueIndex) => {
          let itemType = type;
          if (value) {
            const inferred = classifyItemValue(value);
            if (inferred !== 'text' || itemType === 'text') itemType = inferred;
          }
          return {
            value,
            type: itemType,
            slotId: valueIndex === 0 ? slot.id : `${slot.id}/${valueIndex}`,
            edgeId: slot.edgeId,
            fileId: slot.fileId,
          };
        });
    });

    // Fallback: if upstream IO has data.content file URLs not covered by _fileIds slots,
    // add them with URL-pattern-based type classification.
    const seenSources = new Set<string>();
    const expanded: typeof resolved = [...resolved];
    for (const slot of upstreamSlots) {
      if (slot.sourceNodeType !== 'io') continue;
      if (seenSources.has(slot.sourceNodeId)) continue;
      seenSources.add(slot.sourceNodeId);

      const src = nodes.find((n) => n.id === slot.sourceNodeId);
      const srcData = (src?.data || {}) as Record<string, unknown>;
      const fileIds: number[] = Array.isArray(srcData._fileIds) ? (srcData._fileIds as number[]) : [];
      const content: string[] = Array.isArray(srcData.content) ? (srcData.content as string[]) : [];

      // Only add fallback if _fileIds is empty (passthrough files, not drag-drop)
      if (fileIds.length > 0 || content.length === 0) continue;

      for (const url of content) {
        if (!url || typeof url !== 'string') continue;
        const type = classifyItemValue(url);
        if (type === 'audio') continue;
        expanded.push({
          value: url,
          type: type as 'image' | 'video' | 'text',
          slotId: `${slot.edgeId}/f_fallback_${expanded.length}`,
          edgeId: slot.edgeId,
          fileId: undefined,
        });
      }
    }

    return expanded.filter((item) => item.value);
  }, [upstreamSlots, nodes, nodeOutputs, edges]);
  const rawContent = upstreamItems?.length
    ? upstreamItems.map((item) => item.value)
    : (outputs as Record<string, unknown>)?.result ?? sourceContent;
  const effectiveContent = typeof rawContent === 'string' && rawContent.trim() === '' ? undefined
    : Array.isArray(rawContent) && rawContent.length === 0 ? undefined
    : rawContent;
  const items: unknown[] = Array.isArray(effectiveContent) ? flattenNestedOutput(effectiveContent) : effectiveContent != null ? [String(effectiveContent)] : [];
  const hasContent = items.length > 0;

  const useUpstreamTypes = upstreamItems && upstreamItems.length > 0;

  const imageItems: string[] = useUpstreamTypes
    ? upstreamItems!.filter((s) => s.type === 'image').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'image').map(String);
  const textItems: string[] = useUpstreamTypes
    ? upstreamItems!.filter((s) => s.type === 'text').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'text').map(String);
  const videoItems: string[] = useUpstreamTypes
    ? upstreamItems!.filter((s) => s.type === 'video').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'video').map(String);

  const previewable: { idx: number; value: string; type: string; fileId?: number }[] = useUpstreamTypes
    ? upstreamItems!
        .map((item, i) => ({ idx: i, value: item.value, type: item.type, fileId: item.fileId }))
        .filter((p) => p.type === 'image' || p.type === 'video')
    : (() => {
        const contentArr: string[] = Array.isArray(data.content) ? (data.content as string[]) : [];
        const fileIds: number[] = Array.isArray(data._fileIds) ? (data._fileIds as number[]) : [];
        return items
          .map((value, idx) => {
            const sv = String(value);
            const cIdx = contentArr.indexOf(sv);
            return { idx, value: sv, type: classifyItemValue(value), fileId: cIdx >= 0 ? fileIds[cIdx] : undefined };
          })
          .filter((p) => p.type === 'image' || p.type === 'video');
      })();
  const imagePreviewItems = previewable
    .filter((item) => item.type === 'image')
    .map((item) => ({ src: resizedSrcs[item.idx] || item.value }));
  const canEditSourceImages = !useUpstreamTypes && imagePreviewItems.length > 0;

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      {!hasContent ? (
        <div className="node-gallery-frame-v2">
          <div className="node-gallery-empty-v2">
            <Layers size={32} strokeWidth={1.2} />
            <span>待输入</span>
          </div>
        </div>
      ) : (
        <div className="node-gallery-frame-v2" style={{ padding: 8, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 6, overflowY: 'auto' }}>
          {/* Image thumbnails */}
          {imageItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {imageItems.map((img, idx) => {
                const previewIndex = previewable.findIndex((item) => item.type === 'image' && item.value === img);
                return (
                  <div
                    key={idx}
                    style={{
                      width: 56, height: 56, borderRadius: 8, overflow: 'hidden',
                      background: 'var(--node-card-bg-soft)', cursor: 'pointer',
                      border: '1px solid var(--node-card-line)',
                    }}
                    onClick={() => setPreviewIdx(previewIndex)}
                  >
                    <img src={String(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                );
              })}
              {imageItems.length > 8 && (
                <div style={{
                  width: 56, height: 56, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--node-card-bg-soft)', fontSize: 12, color: 'var(--node-card-muted)',
                }}>
                  +{imageItems.length - 8}
                </div>
              )}
            </div>
          )}

          {/* Text snippets */}
          {textItems.map((text, idx) => (
            <div
              key={`t${idx}`}
              style={{
                fontSize: 10, lineHeight: 1.5, color: 'var(--node-card-ink)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {String(text)}
            </div>
          ))}

          {/* Video indicators */}
          {videoItems.map((_vid, idx) => (
            <div key={`v${idx}`} style={{
              fontSize: 10, color: 'var(--node-card-muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <FileText size={12} /> 视频 {idx + 1}
            </div>
          ))}

          {/* Modal viewer */}
          {previewIdx >= 0 && previewIdx < previewable.length && (
            <ImagePreviewModal
              src={resizedSrcs[previewable[previewIdx].idx] || previewable[previewIdx].value}
              images={imagePreviewItems}
              initialIndex={Math.max(
                0,
                imagePreviewItems.findIndex((item) => item.src === (resizedSrcs[previewable[previewIdx].idx] || previewable[previewIdx].value)),
              )}
              onClose={() => setPreviewIdx(-1)}
              showEditActions={canEditSourceImages}
              onApplyResize={(url, _w, _h, blob, activeItem) => {
                const activePreviewIdx = activeItem?.src
                  ? previewable.findIndex((item) => item.type === 'image' && (resizedSrcs[item.idx] || item.value) === activeItem.src)
                  : previewIdx;
                const targetPreviewIdx = activePreviewIdx >= 0 ? activePreviewIdx : previewIdx;
                const item = previewable[targetPreviewIdx];
                if (!item) return;
                const fid = item.fileId;
                if (!blob || !nodeId) return;
                void createIoImageFileEntry(blob, imageFileNameFromUrl(item.value, blob.type)).then((entry) => {
                  const store = useWorkflowStore.getState();
                  const nd = (store.nodes.find((n) => n.id === nodeId)?.data || {}) as Record<string, unknown>;
                  const fileIds: number[] = Array.isArray(nd._fileIds) ? [...(nd._fileIds as number[])] : [];
                  const fileKinds: string[] = Array.isArray(nd._fileKinds) ? [...(nd._fileKinds as string[])] : [];
                  const fileOrder: number[] = Array.isArray(nd._fileOrder) ? [...(nd._fileOrder as number[])] : [];
                  const content: string[] = Array.isArray(nd.content) ? [...(nd.content as string[])] : [];
                  const fileNames: string[] = Array.isArray(nd._fileNames) ? [...(nd._fileNames as string[])] : [];

                  if (fid !== undefined) {
                    // Replace existing fileRawStore entry
                    fileRawStore.remove(fid);
                  }
                  const newId = entry.fileId;
                  const newUrl = entry.objectUrl || url;

                  // Find or create index: match by old URL in content, or append
                  let idx = fid !== undefined ? fileIds.indexOf(fid) : -1;
                  if (idx < 0) idx = content.indexOf(item.value);
                  if (idx >= 0) {
                    while (content.length <= idx) content.push('');
                    while (fileIds.length <= idx) fileIds.push(newId);
                    while (fileKinds.length <= idx) fileKinds.push('image');
                    fileIds[idx] = newId;
                    content[idx] = newUrl;
                    fileKinds[idx] = 'image';
                    if (fid !== undefined) {
                      const oi = fileOrder.indexOf(fid);
                      if (oi >= 0) fileOrder[oi] = newId;
                    } else if (!fileOrder.includes(newId)) {
                      fileOrder.push(newId);
                    }
                  } else {
                    idx = fileIds.length;
                    fileIds.push(newId);
                    fileKinds.push('image');
                    fileOrder.push(newId);
                    content.push(newUrl);
                  }

                  // Keep name aligned with array positions after possible shifts
                  while (fileNames.length < fileIds.length) fileNames.push('');
                  fileNames[idx >= 0 ? idx : fileIds.length - 1] = entry.fileName;

                  store.updateNodeData(nodeId, { content, _fileIds: fileIds, _fileKinds: fileKinds, _fileOrder: fileOrder, _fileNames: fileNames });
                  setResizedSrcs((prev) => ({ ...prev, [item.idx]: newUrl }));

                  uploadIoImageFileEntry(entry, (uploadedUrl, resultFileName) => {
                    const latestStore = useWorkflowStore.getState();
                    const latestNodeData = (latestStore.nodes.find((n) => n.id === nodeId)?.data || {}) as Record<string, unknown>;
                    const latestFileIds: number[] = Array.isArray(latestNodeData._fileIds) ? [...(latestNodeData._fileIds as number[])] : [];
                    const latestContent: string[] = Array.isArray(latestNodeData.content) ? [...(latestNodeData.content as string[])] : [];
                    const latestFileNames: string[] = Array.isArray(latestNodeData._fileNames) ? [...(latestNodeData._fileNames as string[])] : [];
                    const latestIndex = latestFileIds.indexOf(newId);
                    if (latestIndex < 0) return;
                    latestContent[latestIndex] = uploadedUrl;
                    while (latestFileNames.length < latestFileIds.length) latestFileNames.push('');
                    latestFileNames[latestIndex] = resultFileName || entry.fileName;
                    latestStore.updateNodeData(nodeId, { content: latestContent, _fileNames: latestFileNames });
                  });
                });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
