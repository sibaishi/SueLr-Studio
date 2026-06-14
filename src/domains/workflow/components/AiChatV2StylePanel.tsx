import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';

const MIN_H = 150;
const MAX_H = 300;

const fieldStyle: React.CSSProperties = {
  border: '1px solid var(--t-border)', borderRadius: 8,
  background: 'var(--t-bg2)', color: 'var(--t-text)',
  fontSize: 12, padding: '5px 8px', minHeight: 30, outline: 'none',
};

type InputThumb = { id: string; type: 'text' | 'image'; label: string; value: string };

export default function AiChatV2StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const v2Node = nodes.find((n) => n.selected && n.type === 'aiChatV2');

  const [height, setHeight] = useState(MIN_H);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputsRef = useRef<InputThumb[]>([]);

  const nodeData = (v2Node?.data || {}) as Record<string, unknown>;

  const setData = useCallback((patch: Record<string, unknown>) => {
    if (v2Node) updateNodeData(v2Node.id, patch);
  }, [v2Node, updateNodeData]);

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    const current = inputsRef.current;
    if (current.length === 0) return;
    const reordered = current.map((x) => x.id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setData({ inputOrder: reordered });
  }, [setData]);

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

  if (!v2Node) return null;

  const rawInputs: InputThumb[] = edges
    .filter((e) => e.target === v2Node.id && e.targetHandle === 'input')
    .map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      const srcData = (src?.data || {}) as Record<string, unknown>;
      const handle = e.sourceHandle || '';
      let value = String(srcData[handle] || '');
      if (!value) {
        for (const k of ['text', 'image', 'value', 'fileUrl']) {
          const v = srcData[k];
          if (typeof v === 'string' && v) { value = v; break; }
        }
      }
      if (!value) {
        const srcOutputs = nodeOutputs[e.source];
        if (srcOutputs) {
          const outVal = srcOutputs[handle] || Object.values(srcOutputs).find((v) => typeof v === 'string' && v);
          if (typeof outVal === 'string') value = outVal;
        }
      }
      let type: InputThumb['type'] = 'text';
      if (handle.includes('image') || src?.type?.includes('Image')) type = 'image';
      return { id: e.id, type, label: src?.type || '?', value };
    });

  const TYPE_ORDER: Record<InputThumb['type'], number> = { text: 0, image: 1 };
  const edgeInputOrder: string[] = Array.isArray(nodeData.inputOrder) ? (nodeData.inputOrder as string[]) : [];
  const orderMap = new Map(edgeInputOrder.map((id, i) => [id, i]));
  const inputs = [...rawInputs].sort((a, b) => {
    const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    const ai = orderMap.get(a.id); const bi = orderMap.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  inputsRef.current = inputs;

  const chatModels = availableModels.chat || [];
  const webSearchEnabled = Boolean(nodeData.enableWebSearch);

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
      {/* Input thumbnails */}
      {inputs.length > 0 && (
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
                {input.type === 'image' && input.value ? (
                  <img src={inferImageThumbnailUrl(input.value) || input.value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700 }}>{input.type === 'text' ? 'T' : 'IMG'}</span>
                )}
              </div>
              <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {input.value ? input.value.slice(0, 1) + '…' : '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* System prompt textarea with floating controls */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        <textarea
          className="nodrag nowheel"
          value={String(nodeData.systemPrompt || '')}
          onChange={(e) => setData({ systemPrompt: e.target.value })}
          style={{
            width: '100%', height: '100%', resize: 'none',
            border: '1px solid var(--t-border)', borderRadius: 15,
            outline: 'none', background: 'var(--t-bg2)', color: 'var(--t-text)',
            fontSize: 13, lineHeight: 1.6, padding: '10px 14px 44px', fontFamily: 'inherit',
          }}
          placeholder="系统提示词（如：你是一个有帮助的 AI 助手）"
          onPointerDown={(e) => e.stopPropagation()}
        />

        <div
          className="nodrag"
          style={{
            position: 'absolute', bottom: 6, right: 6,
            display: 'flex', gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setData({ enableWebSearch: !webSearchEnabled })}
            className="nodrag"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 10,
              border: webSearchEnabled ? '1px solid var(--node-color)' : '1px solid transparent',
              background: webSearchEnabled ? 'color-mix(in srgb, var(--node-color) 12%, transparent)' : 'transparent',
              color: webSearchEnabled ? 'var(--node-color)' : 'var(--t-text3)',
              cursor: 'pointer', transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
            }}
            title={webSearchEnabled ? '联网搜索已开启' : '联网搜索'}
          >
            <Globe size={14} />
          </button>
          <PopoverButton icon={<span style={{ fontSize: 12, fontWeight: 700 }}>M</span>} label="模型"
          open={openPopover === 'model'} direction="up"
          onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}>
          <select value={String(nodeData.model || '')} onChange={(e) => setData({ model: e.target.value })}
            className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
            <option value="" disabled>请选择模型...</option>
            {Object.entries(chatModels.reduce<Record<string, typeof chatModels>>((groups, option) => {
              const group = String((option as { group?: string }).group || '');
              groups[group] = groups[group] || []; groups[group].push(option); return groups;
            }, {})).map(([group, options]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                </optgroup>
              ) : options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)
            )}
          </select>
        </PopoverButton>
        </div>
      </div>
    </div>
  );
}

function PopoverButton({ icon, label, open, direction, onToggle, children }: {
  icon: React.ReactNode; label: string; open: boolean; direction: 'up' | 'down'; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={onToggle} className="nodrag"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 10,
          border: open ? '1px solid var(--t-border)' : '1px solid transparent',
          background: open ? 'var(--t-bg2)' : 'transparent',
          color: open ? 'var(--t-text)' : 'var(--t-text3)',
          cursor: 'pointer', transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
        }} title={label}>{icon}</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 31 }} onClick={onToggle} />
          <div className="nodrag" style={{
            position: 'absolute', ...(direction === 'up' ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
            right: 0, padding: 10, minWidth: 220, borderRadius: 15,
            background: 'var(--t-card)', backdropFilter: 'blur(40px)',
            border: '1px solid var(--t-border)',
            boxShadow: direction === 'up' ? '0 -4px 32px rgba(0,0,0,0.18)' : '0 8px 32px rgba(0,0,0,0.18)',
            zIndex: 32,
          }}>{children}</div>
        </>
      )}
    </div>
  );
}
