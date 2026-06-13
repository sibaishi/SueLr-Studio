import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { LongTextEditorModal } from '@/domains/workflow/components/nodes/LongTextEditorModal';
import {
  BoxSelect,
  Grid3X3,
  Image,
  Ruler,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_H = 150;
const MAX_H = 300;

const RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '21:9', value: '21:9' },
];

const RESOLUTION_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '512px', value: '512px' },
  { label: '1k', value: '1k' },
  { label: '2k', value: '2k' },
  { label: '4k', value: '4k' },
];

const FORMAT_OPTIONS = [
  { label: 'png', value: 'png' },
  { label: 'jpeg', value: 'jpeg' },
  { label: 'webp', value: 'webp' },
];

function roundToNearest16(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(16, Math.round(numeric / 16) * 16);
}

const fieldStyle: React.CSSProperties = {
  border: '1px solid var(--t-border)',
  borderRadius: 8,
  background: 'var(--t-bg2)',
  color: 'var(--t-text)',
  fontSize: 12,
  padding: '5px 8px',
  minHeight: 30,
  outline: 'none',
};

type InputThumb = { id: string; type: 'text' | 'image' | 'mask'; label: string; value: string };

export default function NodeStylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const v2Node = nodes.find((n) => n.selected && n.type === 'imageGenV2');

  const [height, setHeight] = useState(MIN_H);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputsRef = useRef<InputThumb[]>([]);

  const nodeData = (v2Node?.data || {}) as Record<string, unknown>;

  useEffect(() => {
    if (v2Node) setPromptValue(String(nodeData.prompt || ''));
  }, [v2Node?.id]);

  const setData = useCallback(
    (patch: Record<string, unknown>) => {
      if (v2Node) updateNodeData(v2Node.id, patch);
    },
    [v2Node, updateNodeData],
  );

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    const current = inputsRef.current;
    if (current.length === 0) return;
    const reordered = current.map((x) => x.id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setData({ inputOrder: reordered });
  }, [setData]);

  const handleDragStart = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
      dragStartY.current = event.clientY;
      dragStartHeight.current = height;
    },
    [height],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      setHeight(Math.min(MAX_H, Math.max(MIN_H, dragStartHeight.current + dragStartY.current - event.clientY)));
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  if (!v2Node) return null;

  // Collect connected input thumbnails
  const rawInputs: InputThumb[] = edges
    .filter((e) => e.target === v2Node.id && e.targetHandle === 'input')
    .map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      const srcData = (src?.data || {}) as Record<string, unknown>;
      const handle = e.sourceHandle || '';
      // Try handle-keyed value, then common keys, then execution outputs
      let value = String(srcData[handle] || '');
      if (!value) {
        for (const k of ['text', 'image', 'mask', 'value', 'fileUrl']) {
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
      else if (handle === 'mask' || src?.type === 'maskInput') type = 'mask';
      return { id: e.id, type, label: src?.type || '?', value };
    });

  // Sort by type group then by inputOrder
  const TYPE_ORDER: Record<InputThumb['type'], number> = { text: 0, image: 1, mask: 2 };
  const inputOrder: string[] = Array.isArray(nodeData.inputOrder) ? (nodeData.inputOrder as string[]) : [];
  const orderMap = new Map(inputOrder.map((id, i) => [id, i]));
  const inputs = [...rawInputs].sort((a, b) => {
    const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    const ai = orderMap.get(a.id);
    const bi = orderMap.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  inputsRef.current = inputs;

  const modelOptions = availableModels.image || [];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 640,
        width: 'calc(100% - 44px)',
        height,
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        gap: 10,
        borderRadius: 25,
        background: 'var(--t-card)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--t-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 30,
        cursor: 'ns-resize',
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientY - rect.top <= 12) handleDragStart(e);
      }}
    >
      {/* Input thumbnails */}
      {inputs.length > 0 && (
        <div
          className="nodrag"
          style={{
            flexShrink: 0,
            display: 'flex',
            gap: 6,
            padding: '0 4px',
            flexWrap: 'wrap',
          }}
        >
          {inputs.map((input, idx) => (
            <div
              key={input.id}
              draggable
              onClick={() => {
                if (draggedIdx !== null) return;
                if ((input.type === 'image' || input.type === 'mask') && input.value) {
                  setPreviewImage(input.value);
                } else if (input.value) {
                  setPreviewText(input.value);
                }
              }}
              onDragStart={(e) => {
                setDraggedIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', input.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverIdx(idx);
              }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedIdx !== null && draggedIdx !== idx) {
                  handleReorder(draggedIdx, idx);
                }
                setDraggedIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => {
                setDraggedIdx(null);
                setDragOverIdx(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 4px',
                borderRadius: 10,
                background: dragOverIdx === idx ? 'var(--t-border)' : 'var(--t-bg2)',
                border: '1px solid var(--t-border)',
                cursor: 'grab',
                fontSize: 11,
                color: 'var(--t-text2)',
                opacity: draggedIdx === idx ? 0.4 : 1,
                transition: 'background 120ms ease, opacity 120ms ease',
              }}
              title={input.value || '暂无内容（拖动可调整顺序）'}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'var(--t-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {(input.type === 'image' || input.type === 'mask') && input.value ? (
                  <img
                    src={inferImageThumbnailUrl(input.value) || input.value}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      ((e.currentTarget as HTMLElement).nextSibling as HTMLElement).style.display = 'flex';
                    }}
                  />
                ) : null}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    display: (input.type === 'image' || input.type === 'mask') && input.value ? 'none' : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {input.type === 'text' ? 'T' : input.type === 'mask' ? 'M' : '?'}
                </span>
              </div>
              <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {input.value ? input.value.slice(0, 1) + '…' : input.type === 'text' ? 'T' : input.type === 'image' ? 'IMG' : 'M'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Textarea + icon buttons */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <textarea
          className="nodrag nowheel"
          value={promptValue}
          onChange={(e) => {
            setPromptValue(e.target.value);
            setData({ prompt: e.target.value });
          }}
          style={{
            width: '100%',
            height: '100%',
            resize: 'none',
            border: '1px solid var(--t-border)',
            borderRadius: 15,
            outline: 'none',
            background: 'var(--t-bg2)',
            color: 'var(--t-text)',
            fontSize: 13,
            lineHeight: 1.6,
            padding: '10px 14px 44px',
            fontFamily: 'inherit',
          }}
          placeholder="输入提示词..."
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Icon buttons at bottom-right */}
        <div
          className="nodrag"
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            display: 'flex',
            gap: 4,
          }}
        >
          <PopoverButton
            icon={<BoxSelect size={14} />}
            label="模型"
            open={openPopover === 'model'}
            direction="up"
            onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
          >
            <select
              value={String(nodeData.model || '')}
              onChange={(e) => setData({ model: e.target.value })}
              className="nodrag"
              style={{ ...fieldStyle, width: '100%' }}
            >
              <option value="" disabled>请选择模型...</option>
              {Object.entries(
                modelOptions.reduce<Record<string, typeof modelOptions>>((groups, option) => {
                  const group = String((option as { group?: string }).group || '');
                  groups[group] = groups[group] || [];
                  groups[group].push(option);
                  return groups;
                }, {}),
              ).map(([group, options]) =>
                group ? (
                  <optgroup key={group} label={group}>
                    {options.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                  ))
                ),
              )}
            </select>
          </PopoverButton>

          <PopoverButton
            icon={<Grid3X3 size={14} />}
            label="比例"
            open={openPopover === 'ratio'}
            direction="up"
            onToggle={() => setOpenPopover(openPopover === 'ratio' ? null : 'ratio')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>比例</div>
                <select
                  value={String(nodeData.ratio || 'auto')}
                  onChange={(e) => setData({ ratio: e.target.value })}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {RATIO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>数量</div>
                <input
                  type="number"
                  value={Number(nodeData.n ?? 1)}
                  onChange={(e) => setData({ n: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                  min={1} max={8}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                />
              </div>
            </div>
          </PopoverButton>

          <PopoverButton
            icon={<Ruler size={14} />}
            label="尺寸"
            open={openPopover === 'size'}
            direction="up"
            onToggle={() => setOpenPopover(openPopover === 'size' ? null : 'size')}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>宽</div>
                <input
                  type="number"
                  value={Number(nodeData.width || 0) || ''}
                  onChange={(e) => setData({ width: Number(e.target.value) || 0 })}
                  onBlur={(e) => setData({ width: roundToNearest16(e.target.value) })}
                  min={16} placeholder="auto"
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>高</div>
                <input
                  type="number"
                  value={Number(nodeData.height || 0) || ''}
                  onChange={(e) => setData({ height: Number(e.target.value) || 0 })}
                  onBlur={(e) => setData({ height: roundToNearest16(e.target.value) })}
                  min={16} placeholder="auto"
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                />
              </div>
            </div>
          </PopoverButton>

          <PopoverButton
            icon={<Image size={14} />}
            label="格式"
            open={openPopover === 'format'}
            direction="up"
            onToggle={() => setOpenPopover(openPopover === 'format' ? null : 'format')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>输出档位</div>
                <select
                  value={String(nodeData.resolution || 'auto')}
                  onChange={(e) => setData({ resolution: e.target.value })}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {RESOLUTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text3)', marginBottom: 4 }}>格式</div>
                <select
                  value={String(nodeData.output_format || 'png')}
                  onChange={(e) => setData({ output_format: e.target.value })}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </PopoverButton>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
      {previewText && (
        <LongTextEditorModal
          title="输入内容"
          value={previewText}
          readOnly
          placeholder=""
          onChange={() => undefined}
          onClose={() => setPreviewText(null)}
        />
      )}
    </div>
  );
}

function PopoverButton({
  icon,
  label,
  open,
  direction,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  direction: 'up' | 'down';
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        className="nodrag"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 10,
          border: open ? '1px solid var(--t-border)' : '1px solid transparent',
          background: open ? 'var(--t-bg2)' : 'transparent',
          color: open ? 'var(--t-text)' : 'var(--t-text3)',
          cursor: 'pointer',
          transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
        }}
        title={label}
      >
        {icon}
      </button>
      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 31,
            }}
            onClick={onToggle}
          />
          <div
            className="nodrag"
            style={{
              position: 'absolute',
              ...(direction === 'up'
                ? { bottom: '100%', marginBottom: 6 }
                : { top: '100%', marginTop: 6 }),
              right: 0,
              padding: 10,
              minWidth: 220,
              borderRadius: 15,
              background: 'var(--t-card)',
              backdropFilter: 'blur(40px)',
              border: '1px solid var(--t-border)',
              boxShadow: direction === 'up'
                ? '0 -4px 32px rgba(0,0,0,0.18)'
                : '0 8px 32px rgba(0,0,0,0.18)',
              zIndex: 32,
            }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
