import type { CSSProperties } from 'react';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { FileText, Layers } from 'lucide-react';
import { useState, useMemo } from 'react';
import '../../node-v2.css';

interface IoContentProps {
  params: ParamDef[];
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
}

function classifyItemValue(value: unknown): 'image' | 'video' | 'audio' | 'text' {
  const str = String(value);
  if (str.startsWith('blob:')) {
    if (str.includes('/image/') || /\.(png|jpg|jpeg|gif|webp|avif)/i.test(str)) return 'image';
    if (str.includes('/video/') || /\.(mp4|webm|mov)/i.test(str)) return 'video';
    if (str.includes('/audio/') || /\.(mp3|wav|ogg)/i.test(str)) return 'audio';
    return 'image'; // default blob as image
  }
  if (str.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(str)) return 'video';
  if (str.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(str)) return 'audio';
  if (str.startsWith('data:image/') || str.startsWith('http') || /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(str)) return 'image';
  return 'text';
}

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
  const patchNodeOutput = useWorkflowStore((s) => s.patchNodeOutput);
  const [previewIdx, setPreviewIdx] = useState<number>(-1);
  const [resizedSrcs, setResizedSrcs] = useState<Record<number, string>>({});

  // Compute upstream content from edges + source nodes, sorted by inputOrder (matching panel drag order)
  const upstreamFromEdges = useMemo(() => {
    if (!nodeId) return null;
    const upstreamEdges = edges.filter((e) => e.target === nodeId && e.targetHandle === 'input');
    if (upstreamEdges.length === 0) return null;

    const inputOrder: string[] = Array.isArray(data.inputOrder) ? (data.inputOrder as string[]) : [];
    const orderMap = new Map(inputOrder.map((id, i) => [id, i]));
    const sorted = [...upstreamEdges].sort((a, b) => {
      const ai = orderMap.get(a.id); const bi = orderMap.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });

    return sorted.map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      const srcData = (src?.data || {}) as Record<string, unknown>;
      const handle = e.sourceHandle || '';
      let v = srcData[handle];
      if (v === undefined || v === null || v === '') {
        for (const k of ['text', 'image', 'video', 'audio', 'mask', 'value', 'fileUrl']) {
          const val = srcData[k];
          if (typeof val === 'string' && val) { v = val; break; }
        }
      }
      if (!v) {
        const srcOutputs = nodeOutputs[e.source];
        if (srcOutputs) {
          const outVal = srcOutputs[handle] || Object.values(srcOutputs).find((ov) => typeof ov === 'string' && ov);
          if (typeof outVal === 'string') v = outVal;
        }
      }
      return v ?? null;
    }).filter((v) => v !== null);
  }, [nodeId, edges, nodes, nodeOutputs, data.inputOrder]);

  // Source-mode content: combine text + file URLs, same as panel display
  const sourceContent = useMemo(() => {
    const text = data.text;
    const files = data.content;
    if (text && Array.isArray(files) && files.length > 0) return [text, ...files];
    if (Array.isArray(files) && files.length > 0) return files;
    if (text) return text;
    return null;
  }, [data.text, data.content]);

  const rawContent = upstreamFromEdges?.length
    ? upstreamFromEdges.length === 1 ? upstreamFromEdges[0] : upstreamFromEdges
    : (outputs as Record<string, unknown>)?.result ?? sourceContent;
  const effectiveContent = typeof rawContent === 'string' && rawContent.trim() === '' ? undefined
    : Array.isArray(rawContent) && rawContent.length === 0 ? undefined
    : rawContent;
  const items: unknown[] = Array.isArray(effectiveContent) ? effectiveContent : effectiveContent != null ? [effectiveContent] : [];
  const hasContent = items.length > 0;

  const imageItems = items.filter((item) => classifyItemValue(item) === 'image');
  const textItems = items.filter((item) => classifyItemValue(item) === 'text');
  const videoItems = items.filter((item) => classifyItemValue(item) === 'video');

  const previewable = items
    .map((value, idx) => ({ idx, value: String(value), type: classifyItemValue(value) }))
    .filter((p) => p.type === 'image' || p.type === 'video');

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
        <div className="node-gallery-frame-v2" style={{ padding: 8, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 6 }}>
          {/* Image thumbnails */}
          {imageItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {imageItems.map((img, idx) => {
                const globalIdx = items.indexOf(img);
                return (
                  <div
                    key={idx}
                    style={{
                      width: 56, height: 56, borderRadius: 8, overflow: 'hidden',
                      background: 'var(--node-card-bg-soft)', cursor: 'pointer',
                      border: '1px solid var(--node-card-line)',
                    }}
                    onClick={() => setPreviewIdx(previewable.findIndex(p => p.idx === globalIdx))}
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
                maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {String(text).slice(0, 200)}
              {String(text).length > 200 ? '...' : ''}
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
              src={resizedSrcs[previewIdx] || previewable[previewIdx].value}
              onClose={() => setPreviewIdx(-1)}
              onApplyResize={(url) => {
                setResizedSrcs((prev) => {
                  const next = { ...prev, [previewIdx]: url };
                  if (prev[previewIdx]) URL.revokeObjectURL(prev[previewIdx]);
                  return next;
                });
                if (nodeId) patchNodeOutput(nodeId, { result: url });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
