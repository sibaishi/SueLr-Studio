import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { expandAiV3InputSlots } from '@/domains/workflow/lib/store/helpers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fileRawStore } from './nodes/io/fileRawStore';

const MIN_H = 150;
const MAX_H = 300;
const ALLOWED_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mov|mkv|mp3|wav|ogg|aac|flac|txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|mkv)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|aac|flac)$/i;

type FileKind = 'image' | 'video' | 'audio' | 'other';
const KIND_ORDER: Record<FileKind, number> = { image: 0, video: 1, audio: 2, other: 3 };

interface FileThumb { _id: number; name: string; kind: FileKind; thumbnail: string; objectUrl: string }
type InputThumb = { id: string; type: 'text' | 'image' | 'video' | 'audio' | 'mask'; label: string; value: string };

function classifyFile(file: File): FileKind {
  if (IMAGE_EXTENSIONS.test(file.name) || file.type.startsWith('image/')) return 'image';
  if (VIDEO_EXTENSIONS.test(file.name) || file.type.startsWith('video/')) return 'video';
  if (AUDIO_EXTENSIONS.test(file.name) || file.type.startsWith('audio/')) return 'audio';
  return 'other';
}

function createThumbnailFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 128;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

export default function IoStylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);

  const ioNode = nodes.find((n) => n.selected && n.type === 'io');
  const selectedNodeId = ioNode?.id;
  const nodeData = (ioNode?.data || {}) as Record<string, unknown>;
  const hasUpstream = !!selectedNodeId && edges.some((e) => e.target === selectedNodeId);

  const [height, setHeight] = useState(MIN_H);
  const [dragging, setDragging] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const inputsRef = useRef<InputThumb[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [textValue, setTextValue] = useState('');
  const [files, setFiles] = useState<FileThumb[]>([]);

  const setData = useCallback((patch: Record<string, unknown>) => {
    if (selectedNodeId) updateNodeData(selectedNodeId, patch);
  }, [selectedNodeId, updateNodeData]);

  const buildFilesFromData = useCallback(() => {
    const content = nodeData.content;
    const fileIds: number[] = (nodeData._fileIds as number[]) || [];
    const fileKinds: string[] = (nodeData._fileKinds as string[]) || [];
    const arr = Array.isArray(content) ? content : [];
    return arr.map((entry, idx) => {
      const fid = fileIds[idx] ?? -1;
      const rec = fid >= 0 ? fileRawStore.get(fid) : undefined;
      return {
        _id: fid, name: rec?.name || '',
        kind: (fileKinds[idx] as FileKind) || 'other',
        thumbnail: String(entry), objectUrl: rec?.objectUrl || '',
      };
    });
  }, [nodeData.content, nodeData._fileIds, nodeData._fileKinds]);

  useEffect(() => {
    setTextValue(String(nodeData.text || ''));
    setFiles(buildFilesFromData());
  }, [selectedNodeId]);

  useEffect(() => {
    if (hasUpstream) return;
    if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const fileUrls: string[] = sortedFiles.map((f) => f.objectUrl || f.thumbnail);
      setData({
        text: textValue || '',
        content: fileUrls,
        _fileIds: sortedFiles.filter((f) => f._id >= 0).map((f) => f._id),
        _fileKinds: sortedFiles.map((f) => f.kind),
      });
    }, 300);
    return () => { if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current); };
  }, [textValue, files]);

  // ── resize ──
  const handleDragStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    setDragging(true);
    dragStartY.current = event.clientY;
    dragStartHeight.current = height;
  }, [height]);
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => setHeight(Math.min(MAX_H, Math.max(MIN_H, dragStartHeight.current + dragStartY.current - event.clientY)));
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

  // ── file ops ──
  const isTextFile = (file: File) => TEXT_EXTENSIONS.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json';
  const handleFileUpload = async (fileList: FileList) => {
    const newFiles: FileThumb[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_EXTENSIONS.test(file.name) && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/') && !file.type.startsWith('text/')) continue;
      if (isTextFile(file)) {
        const text = await file.text();
        setTextValue((prev) => prev + (prev ? '\n' : '') + `[${file.name}]\n` + text + '\n');
        continue;
      }
      const kind = classifyFile(file);
      const thumbnail = kind === 'image' ? await createThumbnailFromBlob(file).catch(() => '') : '';
      const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.onload = () => r(String(reader.result)); reader.readAsDataURL(file); });
      const id = fileRawStore.add(file, file.name, base64);
      const rec = fileRawStore.get(id)!;
      newFiles.push({ _id: id, name: file.name, kind, thumbnail, objectUrl: rec.objectUrl });
    }
    if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
  };
  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => {
      const entry = prev[idx];
      if (entry && entry._id >= 0) fileRawStore.remove(entry._id);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // ═══ V3-STYLE UPSTREAM INPUTS (slot expansion, same as AiV3StylePanel) ═══
  const rawInputs: InputThumb[] = selectedNodeId
    ? expandAiV3InputSlots(selectedNodeId, edges, nodes).map((slot) => {
        const src = nodes.find((n) => n.id === slot.sourceNodeId);
        const srcData = (src?.data || {}) as Record<string, unknown>;
        const srcOutputs = nodeOutputs[slot.sourceNodeId];

        let value = '';
        if (slot.sourceNodeType === 'io') {
          if (slot.type === 'text') {
            value = String(srcData.text || '');
          } else if (slot.fileId !== undefined) {
            value = fileRawStore.getObjectUrl(slot.fileId) || '';
          }
        } else {
          const handle = 'output';
          value = String(srcData[handle] || '');
          if (!value) {
            for (const k of ['text', 'image', 'video', 'audio', 'value', 'fileUrl']) {
              const v = srcData[k];
              if (typeof v === 'string' && v) { value = v; break; }
            }
          }
          if (!value && srcOutputs) {
            let outVal: unknown = srcOutputs[handle];
            if (Array.isArray(outVal)) {
              const collect = (arr: unknown[]): string[] => {
                const acc: string[] = [];
                for (const v of arr) {
                  if (typeof v === 'string') acc.push(v);
                  else if (Array.isArray(v)) acc.push(...collect(v));
                }
                return acc;
              };
              const strings = collect(outVal);
              outVal = strings[strings.length - 1];
            }
            if (typeof outVal !== 'string') {
              outVal = Object.values(srcOutputs).find((v) => typeof v === 'string' && v);
            }
            if (typeof outVal === 'string') value = outVal;
          }
        }

        // Fallback: if slot type is 'text' but value looks like media, override type
        let finalType = slot.type;
        if (finalType === 'text' && value) {
          const str = String(value);
          if (str.startsWith('blob:') || str.startsWith('data:image/') || str.startsWith('data:video/') || str.startsWith('http')) {
            if (str.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(str)) finalType = 'video';
            else finalType = 'image';
          }
        }

        const label =
          slot.sourceNodeType === 'io' && slot.type === 'text' ? '文本' :
          slot.sourceNodeType === 'io' ? `文件${(slot.fileIdx ?? 0) + 1}` :
          src?.type || '?';

        return { id: slot.id, type: finalType as InputThumb['type'], label, value };
      })
    : [];

  const TYPE_ORDER: Record<InputThumb['type'], number> = { text: 0, image: 1, video: 2, audio: 3, mask: 4 };
  const ioInputOrder: string[] = Array.isArray(nodeData.inputOrder) ? (nodeData.inputOrder as string[]) : [];
  const orderMap = new Map(ioInputOrder.map((id, i) => [id, i]));
  const inputs = [...rawInputs].sort((a, b) => {
    const td = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (td !== 0) return td;
    const ai = orderMap.get(a.id); const bi = orderMap.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  inputsRef.current = inputs;

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    const current = inputsRef.current;
    if (current.length === 0) return;
    const reordered = current.map((x) => x.id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setData({ inputOrder: reordered });
  }, [setData]);

  // ── thumb helpers (V3 style) ──
  const thumbLabel = (input: InputThumb) => {
    if (input.value) return input.value.slice(0, 1) + '…';
    const map: Record<string, string> = { text: 'T', image: 'IMG', video: 'V', audio: 'A', mask: 'M' };
    return map[input.type] || '?';
  };
  const thumbLetter = (input: InputThumb) => {
    const map: Record<string, string> = { text: 'T', image: 'IMG', video: 'V', audio: 'A', mask: 'M' };
    return map[input.type] || '?';
  };

  // source mode: sort user files (V3-style)
  const fileOrder: number[] = (nodeData._fileOrder as number[]) || [];
  const fileOrderMap = new Map(fileOrder.map((id, i) => [id, i]));
  const sortedFiles = [...files].sort((a, b) => {
    const kd = (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99);
    if (kd !== 0) return kd;
    const ai = fileOrderMap.get(a._id); const bi = fileOrderMap.get(b._id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });

  const srcThumbLetter = (f: FileThumb) => {
    const map: Record<string, string> = { image: 'IMG', video: 'V', audio: 'A', other: 'T' };
    return map[f.kind] || '?';
  };

  if (!ioNode) return null;

  // ═══ PANEL ═══
  return (
    <div
      style={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 640, width: 'calc(100% - 44px)', height,
        display: 'flex', flexDirection: 'column', padding: 8, gap: 10,
        borderRadius: 25, background: 'var(--t-card)', backdropFilter: 'blur(40px)',
        border: '1px solid var(--t-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 30, cursor: 'ns-resize',
      }}
      onPointerDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientY - rect.top <= 12) handleDragStart(e); }}
    >
      {/* ── V3-STYLE UPSTREAM CHIPS ── */}
      {hasUpstream && inputs.length > 0 && (
        <div className="nodrag" style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap' }}>
          {inputs.map((input, idx) => (
            <div
              key={input.id} draggable
              onDragStart={(e) => { setDraggedIdx(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', input.id); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => { e.preventDefault(); if (draggedIdx !== null && draggedIdx !== idx) handleReorder(draggedIdx, idx); setDraggedIdx(null); setDragOverIdx(null); }}
              onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 4px',
                borderRadius: 10, background: dragOverIdx === idx ? 'var(--t-border)' : 'var(--t-bg2)',
                border: '1px solid var(--t-border)', cursor: 'grab', fontSize: 11, color: 'var(--t-text2)',
                opacity: draggedIdx === idx ? 0.4 : 1, transition: 'background 120ms ease, opacity 120ms ease',
              }}
              title={input.value || '暂无内容（拖动可调整顺序）'}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {(input.type === 'image' || input.type === 'video' || input.type === 'mask') && input.value ? (
                  <img src={inferImageThumbnailUrl(input.value) || input.value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700 }}>{thumbLetter(input)}</span>
                )}
              </div>
              <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {thumbLabel(input)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── SOURCE MODE: user-uploaded file chips ── */}
      {!hasUpstream && (
        <div className="nodrag" style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
        >
          {sortedFiles.map((f, idx) => (
            <div
              key={f._id >= 0 ? f._id : `p${idx}`} draggable
              onDragStart={(e) => { setDraggedIdx(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(f._id)); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => { e.preventDefault(); if (draggedIdx !== null && draggedIdx !== idx) {
                const current = sortedFiles;
                if (current.length > 0) {
                  const reordered = current.map((x) => x._id);
                  const [moved] = reordered.splice(draggedIdx, 1);
                  reordered.splice(idx, 0, moved);
                  setData({ _fileOrder: reordered });
                }
                setDraggedIdx(null); setDragOverIdx(null);
              } else { setDraggedIdx(null); setDragOverIdx(null); } }}
              onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 4px',
                borderRadius: 10, background: dragOverIdx === idx ? 'var(--t-border)' : 'var(--t-bg2)',
                border: '1px solid var(--t-border)', cursor: 'grab', fontSize: 11, color: 'var(--t-text2)',
                opacity: draggedIdx === idx ? 0.4 : 1, transition: 'background 120ms ease, opacity 120ms ease',
              }}
              title={f.name || '暂无内容（拖动可调整顺序）'}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {(f.kind === 'image' || f.kind === 'video') && f.objectUrl ? (
                  <img src={f.objectUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700 }}>{srcThumbLetter(f)}</span>
                )}
              </div>
              <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name ? f.name.slice(0, 1) + '…' : '?' }
              </span>
              <button
                onPointerDown={(e) => { e.stopPropagation(); const realIdx = files.findIndex((x) => x._id === f._id); if (realIdx >= 0) removeFile(realIdx); }}
                style={{ width: 16, height: 16, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--t-text3)', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                title="移除"
              >×</button>
            </div>
          ))}
          {/* + add files chip */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 4px', borderRadius: 10, background: 'transparent', border: '1px dashed var(--t-border)', cursor: 'pointer', fontSize: 11, color: 'var(--t-text3)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--t-border)' }}>
              <span style={{ fontSize: 14, lineHeight: 1, color: 'var(--t-text3)' }}>+</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--t-text3)' }}>添加文件</span>
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple
        accept="image/*,video/*,audio/*,text/*,.json,.csv,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.sh,.bat,.ps1,.yaml,.yml,.md,.log"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) handleFileUpload(e.target.files); }}
      />

      {/* ── Text area ── */}
      {!hasUpstream && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
          <textarea
            className="nodrag nowheel"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="输入文本内容..."
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%', height: '100%', resize: 'none',
              border: '1px solid var(--t-border)', borderRadius: 15,
              outline: 'none', background: 'var(--t-bg2)', color: 'var(--t-text)',
              fontSize: 13, lineHeight: 1.6, padding: '10px 14px', fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* ── Upstream locked indicator ── */}
      {hasUpstream && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--t-text3)' }}>
          上游 {inputs.length} 项数据，锁定中
        </div>
      )}
    </div>
  );
}
