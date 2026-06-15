import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { filterAiV3InputSlots } from '@/domains/workflow/lib/store/helpers';
import { fileRawStore } from '@/domains/workflow/components/nodes/io/fileRawStore';
import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoxSelect, Clock, Globe, Grid3X3, Image, Ruler } from 'lucide-react';

const MIN_H = 150;
const MAX_H = 300;

const fieldStyle: React.CSSProperties = {
  border: '1px solid var(--t-border)', borderRadius: 8,
  background: 'var(--t-bg2)', color: 'var(--t-text)',
  fontSize: 12, padding: '5px 8px', minHeight: 30, outline: 'none',
};

const RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' }, { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
  { label: '3:2', value: '3:2' }, { label: '2:3', value: '2:3' },
];

const RESOLUTION_OPTIONS = [
  { label: 'auto', value: 'auto' }, { label: '512px', value: '512px' },
  { label: '1k', value: '1k' }, { label: '2k', value: '2k' }, { label: '4k', value: '4k' },
];

const FORMAT_OPTIONS = [
  { label: 'png', value: 'png' }, { label: 'jpeg', value: 'jpeg' }, { label: 'webp', value: 'webp' },
];

const VIDEO_DURATION_OPTIONS = [
  { label: '自动', value: -1 }, { label: '4 秒', value: 4 }, { label: '5 秒', value: 5 },
  { label: '6 秒', value: 6 }, { label: '7 秒', value: 7 }, { label: '8 秒', value: 8 },
  { label: '9 秒', value: 9 }, { label: '10 秒', value: 10 }, { label: '11 秒', value: 11 },
  { label: '12 秒', value: 12 }, { label: '13 秒', value: 13 }, { label: '14 秒', value: 14 }, { label: '15 秒', value: 15 },
];

const VIDEO_RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' }, { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' }, { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { label: '480p', value: '480p' }, { label: '720p', value: '720p' }, { label: '1080p', value: '1080p' },
];

function roundToNearest16(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 16) return 0;
  return Math.round(numeric / 16) * 16;
}

type InputThumb = { id: string; type: 'text' | 'image' | 'video' | 'audio' | 'mask'; label: string; value: string };

export default function AiV3StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const v3Node = nodes.find((n) => n.selected && n.type === 'aiV3');

  const [height, setHeight] = useState(MIN_H);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputsRef = useRef<InputThumb[]>([]);
  const [promptValue, setPromptValue] = useState('');

  const nodeData = (v3Node?.data || {}) as Record<string, unknown>;

  const setData = useCallback((patch: Record<string, unknown>) => {
    if (v3Node) updateNodeData(v3Node.id, patch);
  }, [v3Node, updateNodeData]);

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

  // sync prompt from nodeData when node changes
  useEffect(() => {
    setPromptValue(String(nodeData.prompt || ''));
  }, [v3Node?.id, nodeData.prompt]);

  // ── mode detection (all hooks before early return) ──
  const selectedModel = v3Node ? String(((v3Node.data || {}) as Record<string, unknown>).model || '') : '';

  const determineMode = useCallback((modelValue: string) => {
    if (!modelValue) return 'chat';
    if ((availableModels.image || []).some((m) => String(m.value) === modelValue)) return 'image';
    if ((availableModels.video || []).some((m) => String(m.value) === modelValue)) return 'video';
    if ((availableModels.chat || []).some((m) => String(m.value) === modelValue)) return 'chat';
    return 'chat';
  }, [availableModels]);

  const currentMode = (nodeData.mode as string) || determineMode(selectedModel);

  const handleModelChange = useCallback((value: string) => {
    const mode = determineMode(value);
    setData({ model: value, mode });
  }, [determineMode, setData]);

  // ── early exit ──
  if (!v3Node) return null;

  // ── input thumbnails (slot-level: IO nodes are expanded) ──
  const filterResult = filterAiV3InputSlots(v3Node.id, currentMode, edges, nodes);
  const rawInputs: InputThumb[] = filterResult.acceptedSlots.map((slot) => {
    const src = nodes.find((n) => n.id === slot.sourceNodeId);
    const srcData = (src?.data || {}) as Record<string, unknown>;
    const srcOutputs = nodeOutputs[slot.sourceNodeId];

    // Determine value for thumbnail / tooltip
    let value = '';
    if (slot.sourceNodeType === 'io') {
      if (slot.type === 'text') {
        value = String(srcData.text || '');
      } else if (slot.fileId !== undefined) {
        // fileRawStore is cleared on page refresh; fall back to data.content server URL
        const content: string[] = Array.isArray(srcData.content) ? (srcData.content as string[]) : [];
        const fileIds: number[] = Array.isArray(srcData._fileIds) ? (srcData._fileIds as number[]) : [];
        const cIdx = fileIds.indexOf(slot.fileId);
        value = fileRawStore.getObjectUrl(slot.fileId)
          || (cIdx >= 0 ? content[cIdx] : '')
          || '';
      }
    } else {
      // Standard node: use actual edge sourceHandle, then common keys, then nodeOutputs
      const edge = edges.find((e) => e.id === slot.edgeId);
      const handle = edge?.sourceHandle || 'output';
      value = String(srcData[handle] || '');
      if (!value) {
        for (const k of ['text', 'image', 'video', 'audio', 'value', 'fileUrl']) {
          const v = srcData[k];
          if (typeof v === 'string' && v) { value = v; break; }
        }
      }
      if (!value && srcOutputs) {
        // Recursively flatten nested arrays (aiV3 image mode returns [prompt, base64])
        const collect = (arr: unknown[]): string[] => {
          const acc: string[] = [];
          for (const v of arr) {
            if (typeof v === 'string') acc.push(v);
            else if (Array.isArray(v)) acc.push(...collect(v));
          }
          return acc;
        };
        let outVal: unknown = srcOutputs[handle];
        if (Array.isArray(outVal)) {
          const strings = collect(outVal);
          outVal = strings[strings.length - 1];
        }
        if (typeof outVal !== 'string') {
          const flatEntries = Object.entries(srcOutputs).flatMap(([_, v]) => {
            if (typeof v === 'string') return [v];
            if (Array.isArray(v)) return collect(v);
            return [];
          });
          outVal = flatEntries.find((v) => typeof v === 'string') || undefined;
        }
        if (typeof outVal === 'string') value = outVal;
      }
    }

    // Infer actual media type from value when slot classification is too broad
    let finalType = slot.type;
    if (finalType === 'text' && value) {
      const str = String(value);
      if (str.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(str)) finalType = 'video';
      else if (str.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(str)) finalType = 'audio';
      else if (str.startsWith('blob:') || str.startsWith('data:image/') || str.startsWith('http') || str.startsWith('/api/')) finalType = 'image';
    }

    const label =
      finalType === 'text' && slot.sourceNodeType === 'io' ? '文本' :
      slot.sourceNodeType === 'io' ? `文件${(slot.fileIdx ?? 0) + 1}` :
      finalType !== 'text' ? getNodeTypeLabel(finalType) :
      src?.type || '?';

    return { id: slot.id, type: finalType, label, value };
  });

  inputsRef.current = rawInputs;
  const inputs = rawInputs;

  const webSearchEnabled = Boolean(nodeData.enableWebSearch);

  // ── grouped ALL models across categories ──
  const allModelOptions = [
    ...(availableModels.chat || []).map((m) => ({ ...m, _cat: 'chat' })),
    ...(availableModels.image || []).map((m) => ({ ...m, _cat: 'image' })),
    ...(availableModels.video || []).map((m) => ({ ...m, _cat: 'video' })),
  ];
  const catLabels: Record<string, string> = { chat: '对话模型', image: '图像生成', video: '视频生成' };
  const groupedModels: Record<string, typeof allModelOptions> = {};
  for (const m of allModelOptions) {
    const cat = (m as typeof m & { _cat: string })._cat;
    (groupedModels[cat] = groupedModels[cat] || []).push(m);
  }

  // thumbnail label helpers
  const TYPE_MAP: Record<string, string> = { text: '文本', image: '图片', video: '视频', audio: '音频', mask: '遮罩' };
  const getNodeTypeLabel = (type: string) => TYPE_MAP[type] || type;

  const thumbLabel = (input: InputThumb) => {
    if (input.value) return input.value.slice(0, 1) + '…';
    const map: Record<string, string> = { text: 'T', image: 'IMG', video: 'V', audio: 'A', mask: 'M' };
    return map[input.type] || '?';
  };
  const thumbLetter = (input: InputThumb) => {
    const map: Record<string, string> = { text: 'T', image: 'IMG', video: 'V', audio: 'A', mask: 'M' };
    return map[input.type] || '?';
  };

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

      {/* ── CHAT MODE ── */}
      {currentMode === 'chat' && (
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
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <button type="button"
              onClick={() => setData({ enableWebSearch: !webSearchEnabled })} className="nodrag"
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
            <PopoverButton icon={<BoxSelect size={14} />} label="模型"
              open={openPopover === 'model'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}>
              <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}
                className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                <option value="" disabled>请选择模型...</option>
                {Object.entries(groupedModels).map(([cat, options]) => (
                  <optgroup key={cat} label={catLabels[cat] || cat}>
                    {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </PopoverButton>
          </div>
        </div>
      )}

      {/* ── IMAGE MODE ── */}
      {currentMode === 'image' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <textarea
            className="nodrag nowheel"
            value={promptValue}
            onChange={(e) => { setPromptValue(e.target.value); setData({ prompt: e.target.value }); }}
            style={{
              width: '100%', height: '100%', resize: 'none',
              border: '1px solid var(--t-border)', borderRadius: 15,
              outline: 'none', background: 'var(--t-bg2)', color: 'var(--t-text)',
              fontSize: 13, lineHeight: 1.6, padding: '10px 14px 44px', fontFamily: 'inherit',
            }}
            placeholder="输入提示词..."
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <PopoverButton icon={<BoxSelect size={14} />} label="模型"
              open={openPopover === 'model'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}>
              <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}
                className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                <option value="" disabled>请选择模型...</option>
                {Object.entries(groupedModels).map(([cat, options]) => (
                  <optgroup key={cat} label={catLabels[cat] || cat}>
                    {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </PopoverButton>
            <PopoverButton icon={<Grid3X3 size={14} />} label="比例" open={openPopover === 'ratio'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'ratio' ? null : 'ratio')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>比例</div>
                  <select value={String(nodeData.ratio || 'auto')} onChange={(e) => setData({ ratio: e.target.value })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                    {RATIO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>数量</div>
                  <input type="number" value={Number(nodeData.n ?? 1)} min={1} max={8}
                    onChange={(e) => setData({ n: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }} />
                </div>
              </div>
            </PopoverButton>
            <PopoverButton icon={<Ruler size={14} />} label="尺寸" open={openPopover === 'size'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'size' ? null : 'size')}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>宽</div>
                  <input type="number" value={Number(nodeData.width || 0) || ''} min={16} placeholder="auto"
                    onChange={(e) => setData({ width: Number(e.target.value) || 0 })}
                    onBlur={(e) => setData({ width: roundToNearest16(e.target.value) })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>高</div>
                  <input type="number" value={Number(nodeData.height || 0) || ''} min={16} placeholder="auto"
                    onChange={(e) => setData({ height: Number(e.target.value) || 0 })}
                    onBlur={(e) => setData({ height: roundToNearest16(e.target.value) })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }} />
                </div>
              </div>
            </PopoverButton>
            <PopoverButton icon={<Image size={14} />} label="格式" open={openPopover === 'format'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'format' ? null : 'format')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>输出档位</div>
                  <select value={String(nodeData.resolution || 'auto')} onChange={(e) => setData({ resolution: e.target.value })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                    {RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>格式</div>
                  <select value={String(nodeData.output_format || 'png')} onChange={(e) => setData({ output_format: e.target.value })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                    {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </PopoverButton>
          </div>
        </div>
      )}

      {/* ── VIDEO MODE ── */}
      {currentMode === 'video' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <textarea
            className="nodrag nowheel"
            value={promptValue}
            onChange={(e) => { setPromptValue(e.target.value); setData({ prompt: e.target.value }); }}
            style={{
              width: '100%', height: '100%', resize: 'none',
              border: '1px solid var(--t-border)', borderRadius: 15,
              outline: 'none', background: 'var(--t-bg2)', color: 'var(--t-text)',
              fontSize: 13, lineHeight: 1.6, padding: '10px 14px 44px', fontFamily: 'inherit',
            }}
            placeholder="输入提示词（描述视频画面和运镜）..."
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <PopoverButton icon={<BoxSelect size={14} />} label="模型"
              open={openPopover === 'model'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}>
              <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}
                className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                <option value="" disabled>请选择模型...</option>
                {Object.entries(groupedModels).map(([cat, options]) => (
                  <optgroup key={cat} label={catLabels[cat] || cat}>
                    {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </PopoverButton>
            <PopoverButton icon={<Clock size={14} />} label="时长" open={openPopover === 'duration'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'duration' ? null : 'duration')}>
              <select value={String(nodeData.duration || 5)} onChange={(e) => setData({ duration: Number(e.target.value) })}
                className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                {VIDEO_DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </PopoverButton>
            <PopoverButton icon={<Ruler size={14} />} label="分辨率" open={openPopover === 'resolution'} direction="up"
              onToggle={() => setOpenPopover(openPopover === 'resolution' ? null : 'resolution')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>比例</div>
                  <select value={String(nodeData.ratio || 'auto')} onChange={(e) => setData({ ratio: e.target.value })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                    {VIDEO_RATIO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>分辨率</div>
                  <select value={String(nodeData.resolution || '720p')} onChange={(e) => setData({ resolution: e.target.value })}
                    className="nodrag" style={{ ...fieldStyle, width: '100%' }}>
                    {VIDEO_RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </PopoverButton>
          </div>
        </div>
      )}
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
