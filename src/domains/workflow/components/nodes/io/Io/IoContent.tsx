import { resolveWorkflowConnections } from '@/domains/workflow/lib/executionGraph';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { NodeCanvasEditorModal } from '@/domains/workflow/components/NodeCanvasEditorModal';
import { uploadFile } from '@/domains/workflow/lib/api/files';
import {
  createIoImageFileEntry,
  imageFileNameFromUrl,
  uploadIoImageFileEntry,
} from '@/domains/workflow/lib/ioImageFiles';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import {
  type AiV3InputSlot,
  expandAiV3InputSlots,
  readInputOrder,
  sortSlotsByInputOrder,
} from '@/domains/workflow/lib/store/helpers';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { Stack } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { fileRawStore } from '../fileRawStore';
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
  if (str.startsWith('data:image/') || str.startsWith('http') || /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(str))
    return 'image';
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

export function IoContent({ params: _params, nodeId, data, outerStyle, onChange: _onChange }: IoContentProps) {
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const canvasEdges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useMemo(() => resolveWorkflowConnections(nodes, canvasEdges), [nodes, canvasEdges]);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number>(-1);
  const [resizedSrcs, setResizedSrcs] = useState<Record<number, string>>({});
  const [textModalIdx, setTextModalIdx] = useState<number | null>(null);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  // Compute upstream content from edges via slot expansion (same as AiV3 panel)
  const upstreamSlots = useMemo((): AiV3InputSlot[] | null => {
    if (!nodeId) return null;
    const upstreamEdges = edges.filter((e) => e.target === nodeId && e.targetHandle === 'input');
    if (upstreamEdges.length === 0) return null;
    const expanded = expandAiV3InputSlots(nodeId, edges, nodes);
    // Apply per-type inputOrder sorting so card matches dialog
    const currentNode = nodes.find((n) => n.id === nodeId);
    const inputOrder = readInputOrder(currentNode ?? null);
    const hasPerType = Object.entries(inputOrder).some(([k, v]) => k !== '_legacy' && Array.isArray(v) && v.length > 0);
    return hasPerType ? sortSlotsByInputOrder(expanded, inputOrder) : expanded;
  }, [nodeId, edges, nodes]);

  // Source-mode content: combine text + file URLs, same as panel display
  const sourceContent = useMemo(() => {
    const text = data.text;
    const rawFiles = data.content;
    const fileOrder: number[] = Array.isArray(data._fileOrder) ? (data._fileOrder as number[]) : [];
    const fileIds: number[] = Array.isArray(data._fileIds) ? (data._fileIds as number[]) : [];

    // Sort files by _fileOrder so the node card reflects the same order as IoStylePanel drag reorder
    let files = rawFiles;
    if (Array.isArray(rawFiles) && rawFiles.length > 0 && fileOrder.length > 0) {
      const orderMap = new Map(fileOrder.map((fid, i) => [fid, i]));
      const withOrder = rawFiles.map((url, idx) => ({
        url,
        order: orderMap.get(fileIds[idx]) ?? 9999,
        idx,
      }));
      files = withOrder.sort((a, b) => a.order - b.order || a.idx - b.idx).map((e) => e.url);
    }

    if (text && Array.isArray(files) && files.length > 0) return [text, ...files];
    if (Array.isArray(files) && files.length > 0) return files;
    if (text) return text;
    return null;
  }, [data.text, data.content, data._fileOrder, data._fileIds]);

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
      const type: string = slot.type;
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
            if (typeof v === 'string' && v) {
              values.push(v);
              break;
            }
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

      return values.filter(Boolean).map((value, valueIndex) => {
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
        expanded.push({
          value: url,
          type,
          slotId: `${slot.edgeId}/f_fallback_${expanded.length}`,
          edgeId: slot.edgeId,
          fileId: undefined,
        });
      }
    }

    return expanded.filter((item) => item.value);
  }, [upstreamSlots, nodes, nodeOutputs, edges]);
  // Source mode: read from persisted node data (panel-aligned).
  const rawContent = upstreamItems?.length ? upstreamItems.map((item) => item.value) : sourceContent;
  const effectiveContent =
    typeof rawContent === 'string' && rawContent.trim() === ''
      ? undefined
      : Array.isArray(rawContent) && rawContent.length === 0
        ? undefined
        : rawContent;
  const items: unknown[] = Array.isArray(effectiveContent)
    ? flattenNestedOutput(effectiveContent)
    : effectiveContent != null
      ? [String(effectiveContent)]
      : [];
  const hasContent = items.length > 0;

  const typedUpstreamItems = upstreamItems?.length ? upstreamItems : null;
  const useUpstreamTypes = typedUpstreamItems !== null;

  const imageItems: string[] = typedUpstreamItems
    ? typedUpstreamItems.filter((s) => s.type === 'image').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'image').map(String);
  const textItems: string[] = typedUpstreamItems
    ? typedUpstreamItems.filter((s) => s.type === 'text').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'text').map(String);
  const videoItems: string[] = typedUpstreamItems
    ? typedUpstreamItems.filter((s) => s.type === 'video').map((s) => s.value)
    : items.filter((item) => classifyItemValue(item) === 'video').map(String);

  const audioItems = typedUpstreamItems
    ? typedUpstreamItems.filter((item) => item.type === 'audio').map((item) => item.value)
    : items.filter((item) => classifyItemValue(item) === 'audio').map(String);

  const previewable: { idx: number; value: string; type: string; fileId?: number }[] = typedUpstreamItems
    ? typedUpstreamItems
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

  const canDrawSketch = Boolean(nodeId && !upstreamSlots && !hasContent && !data.fileUrl);

  const appendBoardImage = async (file: File) => {
    const { activeDocumentId } = useWorkflowStore.getState();
    const uploaded = await uploadFile(file);
    if (!uploaded.success || !uploaded.url) throw new Error(uploaded.error || '图片上传失败。');

    const entry = await createIoImageFileEntry(file);
    const store = useWorkflowStore.getState();
    const node = store.nodes.find((item) => item.id === nodeId && item.type === 'io');
    const hasUpstream = resolveWorkflowConnections(store.nodes, store.edges).some((edge) => edge.target === nodeId && edge.targetHandle === 'input');
    if (!nodeId || !node || store.activeDocumentId !== activeDocumentId || hasUpstream) {
      fileRawStore.remove(entry.fileId);
      throw new Error('当前 IO 节点已发生变化，请重新打开画板。');
    }

    const data = node.data;
    const content = Array.isArray(data.content) ? data.content : [];
    const ids = Array.isArray(data._fileIds) ? data._fileIds : [];
    const kinds = Array.isArray(data._fileKinds) ? data._fileKinds : [];
    const names = Array.isArray(data._fileNames) ? data._fileNames : [];
    const order = Array.isArray(data._fileOrder) ? data._fileOrder : [];
    const count = Math.max(content.length, ids.length);
    const fileIds = Array.from({ length: count }, (_, index) => ids[index] ?? fileRawStore.reserveId());
    const orderedIds = new Set([...order.filter((id) => fileIds.includes(id)), ...fileIds]);
    store.updateNodeData(nodeId, {
      content: [...Array.from({ length: count }, (_, index) => content[index] ?? ''), uploaded.url],
      _fileIds: [...fileIds, entry.fileId],
      _fileKinds: [...fileIds.map((_, index) => kinds[index] ?? classifyItemValue(content[index])), 'image'],
      _fileOrder: [...orderedIds, entry.fileId],
      _fileNames: [
        ...fileIds.map((_, index) => names[index] ?? (content[index] ? imageFileNameFromUrl(content[index]) : '')),
        uploaded.fileName || entry.fileName,
      ],
    });
  };

  return (
    <div className="node-gallery-shell-v2" style={{ ...outerStyle, overflow: 'hidden' }}>
      {!hasContent ? (
        <div className="node-gallery-frame-v2" style={{ flexDirection: 'column', gap: 8 }}>
          <div className="node-gallery-empty-v2">
            <Stack size={32} strokeWidth={1.2} />
            <span>待输入</span>
          </div>
          {canDrawSketch && (
            <button
              type="button"
              className="node-v2-secondary-button nodrag nopan"
              onClick={(event) => {
                event.stopPropagation();
                setIsSketchOpen(true);
              }}
            >
              绘制草图
            </button>
          )}
        </div>
      ) : (
        <div
          className="node-gallery-frame-v2"
          style={{
            padding: 8,
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            gap: 6,
            overflowY: 'auto',
          }}
        >
          {/* Image thumbnails */}
          {imageItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {imageItems.map((img, idx) => {
                const previewIndex = previewable.findIndex((item) => item.type === 'image' && item.value === img);
                return (
                  <div
                    key={idx}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'var(--node-card-bg-soft)',
                      cursor: 'pointer',
                      border: '1px solid var(--node-card-line)',
                    }}
                    title="双击全屏查看"
                    onDoubleClick={() => setPreviewIdx(previewIndex)}
                  >
                    <img src={String(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Text snippets */}
          {textItems.map((text, idx) => (
            <div
              key={`t${idx}`}
              onDoubleClick={() => setTextModalIdx(idx)}
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: 'var(--node-card-ink)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid transparent',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--node-card-bg-soft)';
                e.currentTarget.style.borderColor = 'var(--node-card-line)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              {String(text)}
            </div>
          ))}

          {audioItems.map((src, index) => (
            <audio
              key={index}
              className="nodrag nopan"
              src={src}
              controls
              preload="metadata"
              style={{ width: '100%' }}
            />
          ))}

          {videoItems.map((src, index) => (
            <video
              className="nodrag nopan"
              key={index}
              src={src}
              controls
              preload="metadata"
              style={{ width: '100%' }}
            />
          ))}

          {/* Modal viewer */}
          {previewIdx >= 0 && previewIdx < previewable.length && (
            <ImagePreviewModal
              src={resizedSrcs[previewable[previewIdx].idx] || previewable[previewIdx].value}
              images={imagePreviewItems}
              initialIndex={Math.max(
                0,
                imagePreviewItems.findIndex(
                  (item) => item.src === (resizedSrcs[previewable[previewIdx].idx] || previewable[previewIdx].value),
                ),
              )}
              onClose={() => setPreviewIdx(-1)}
              showEditActions={canEditSourceImages}
              onExportLayer={nodeId && !upstreamSlots ? appendBoardImage : undefined}
              onSaveBoardImage={(url, blob, activeItem) => {
                const activePreviewIdx = activeItem?.src
                  ? previewable.findIndex(
                      (item) => item.type === 'image' && (resizedSrcs[item.idx] || item.value) === activeItem.src,
                    )
                  : previewIdx;
                const targetPreviewIdx = activePreviewIdx >= 0 ? activePreviewIdx : previewIdx;
                const item = previewable[targetPreviewIdx];
                if (!item) return;
                const fid = item.fileId;
                if (!nodeId) return;
                return createIoImageFileEntry(blob, imageFileNameFromUrl(item.value, blob.type)).then((entry) => {
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

                  store.updateNodeData(nodeId, {
                    content,
                    _fileIds: fileIds,
                    _fileKinds: fileKinds,
                    _fileOrder: fileOrder,
                    _fileNames: fileNames,
                  });
                  setResizedSrcs((prev) => ({ ...prev, [item.idx]: newUrl }));

                  uploadIoImageFileEntry(entry, (uploadedUrl, resultFileName) => {
                    const latestStore = useWorkflowStore.getState();
                    const latestNodeData = (latestStore.nodes.find((n) => n.id === nodeId)?.data || {}) as Record<
                      string,
                      unknown
                    >;
                    const latestFileIds: number[] = Array.isArray(latestNodeData._fileIds)
                      ? [...(latestNodeData._fileIds as number[])]
                      : [];
                    const latestContent: string[] = Array.isArray(latestNodeData.content)
                      ? [...(latestNodeData.content as string[])]
                      : [];
                    const latestFileNames: string[] = Array.isArray(latestNodeData._fileNames)
                      ? [...(latestNodeData._fileNames as string[])]
                      : [];
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

          {/* Text editor/viewer modal */}
          {textModalIdx !== null && textItems[textModalIdx] !== undefined && (
            <ImagePreviewModal
              src=""
              textContent={String(textItems[textModalIdx] || '')}
              onTextChange={
                !upstreamSlots
                  ? (text) => {
                      if (nodeId) updateNodeData(nodeId, { text });
                    }
                  : undefined
              }
              onClose={() => setTextModalIdx(null)}
            />
          )}
        </div>
      )}
      {isSketchOpen && (
        <NodeCanvasEditorModal
          nodeLabel="绘制草图"
          onClose={() => setIsSketchOpen(false)}
          onSavePaint={appendBoardImage}
          onExportLayer={appendBoardImage}
        />
      )}
    </div>
  );
}
