import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { resolveStylePanelInput } from '@/domains/workflow/components/stylePanelInputResolver';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { type InputOrderMap, filterAiV3InputSlots, readInputOrder } from '@/domains/workflow/lib/store/helpers';
import { loadJSON } from '@/shared/runtime';
import type { ApiConfig } from '@/shared/types';
import { BoxSelect, Clock, Gauge, Globe, Grid3X3, Image, Ruler, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MIN_H = 150;
const MAX_H = 300;

const fieldStyle: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, var(--t-border) 72%, transparent)',
  borderRadius: 9,
  background: 'color-mix(in srgb, var(--t-bg2) 60%, transparent)',
  color: 'var(--t-text)',
  fontSize: 12,
  padding: '6px 10px',
  minHeight: 32,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

const RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
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

const VIDEO_DURATION_OPTIONS = [
  { label: '自动', value: -1 },
  { label: '4 秒', value: 4 },
  { label: '5 秒', value: 5 },
  { label: '6 秒', value: 6 },
  { label: '7 秒', value: 7 },
  { label: '8 秒', value: 8 },
  { label: '9 秒', value: 9 },
  { label: '10 秒', value: 10 },
  { label: '11 秒', value: 11 },
  { label: '12 秒', value: 12 },
  { label: '13 秒', value: 13 },
  { label: '14 秒', value: 14 },
  { label: '15 秒', value: 15 },
];

const VIDEO_RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
];

function roundToNearest16(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 16) return 0;
  return Math.round(numeric / 16) * 16;
}

type InputThumb = {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  label: string;
  value: string;
  sourceNodeId: string;
  edgeId: string;
};

export default function AiV3StylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  // Only show panel when exactly one panel-capable node is selected across all types
  const v3Node = (() => {
    const selectedPanelNodes = nodes.filter((n) => n.selected && (n.type === 'io' || n.type === 'aiV3'));
    if (selectedPanelNodes.length !== 1) return null;
    return selectedPanelNodes[0].type === 'aiV3' ? selectedPanelNodes[0] : null;
  })();

  // 取消选中节点时自动关闭 popover
  useEffect(() => {
    if (!v3Node) setOpenPopover(null);
  }, [v3Node]);

  const [height, setHeight] = useState(MIN_H);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [draggedGroupIdx, setDraggedGroupIdx] = useState<number | null>(null);
  const [dragOverGroupIdx, setDragOverGroupIdx] = useState<number | null>(null);
  const [draggedGroupType, setDraggedGroupType] = useState<string | null>(null);
  const typeGroupsRef = useRef<Record<string, { items: InputThumb[]; sourceNodeId: string }[]>>({});
  const [promptValue, setPromptValue] = useState('');

  const nodeData = (v3Node?.data || {}) as Record<string, unknown>;

  const setData = useCallback(
    (patch: Record<string, unknown>) => {
      if (v3Node) updateNodeData(v3Node.id, patch);
    },
    [v3Node, updateNodeData],
  );

  const handleGroupReorder = useCallback(
    (type: string, fromIdx: number, toIdx: number) => {
      const group = typeGroupsRef.current[type];
      if (!group || group.length === 0 || fromIdx === toIdx) return;
      const reordered = [...group.map((e) => e.items[0]?.edgeId || '')];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const currentOrder = readInputOrder(v3Node);
      const newOrder: InputOrderMap = { ...currentOrder };
      for (const t of Object.keys(currentOrder)) {
        delete newOrder[t];
      }
      for (const t of Object.keys(typeGroupsRef.current)) {
        if (t === type) newOrder[t] = reordered;
        else newOrder[t] = typeGroupsRef.current[t].map((e) => e.items[0]?.edgeId || '');
      }
      // Preserve _legacy if it existed
      if (currentOrder._legacy) newOrder._legacy = currentOrder._legacy;

      setData({ inputOrder: newOrder });
    },
    [v3Node, setData],
  );

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
    const move = (event: PointerEvent) =>
      setHeight(Math.min(MAX_H, Math.max(MIN_H, dragStartHeight.current + dragStartY.current - event.clientY)));
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  // sync prompt from nodeData when node changes
  useEffect(() => {
    setPromptValue(String(nodeData.prompt || ''));
  }, [v3Node?.id, nodeData.prompt]);

  // ── mode detection (all hooks before early return) ──
  const selectedModel = v3Node ? String(((v3Node.data || {}) as Record<string, unknown>).model || '') : '';

  const isModelMatch = (m: { value: string; modelId: string }, modelValue: string) =>
    String(m.value) === modelValue || String(m.modelId) === modelValue;

  const determineMode = useCallback(
    (modelValue: string) => {
      if (!modelValue) return 'chat';
      if ((availableModels.image || []).some((m) => isModelMatch(m, modelValue))) return 'image';
      if ((availableModels.video || []).some((m) => isModelMatch(m, modelValue))) return 'video';
      if ((availableModels.chat || []).some((m) => isModelMatch(m, modelValue))) return 'chat';
      if ((availableModels.midjourney || []).some((m) => isModelMatch(m, modelValue))) return 'midjourney';
      return 'chat';
    },
    [availableModels],
  );

  const currentMode = (nodeData.mode as string) || determineMode(selectedModel);

  const handleModelChange = useCallback(
    (value: string) => {
      const mode = determineMode(value);
      setData({ model: value, mode });
      setOpenPopover(null);
    },
    [determineMode, setData],
  );

  // ── type labels (used in both rawInputs & typeGroups, hoist before early return) ──
  const TYPE_ORDER_KEYS = ['text', 'image', 'video', 'audio'] as const;
  const TYPE_LABEL: Record<string, string> = { text: '文本', image: '图片', video: '视频', audio: '音频' };
  const getNodeTypeLabel = (type: string) => TYPE_LABEL[type] || type;

  // ── rawInputs (useMemo: must be before early return to keep hook count stable) ──
  const rawInputs: InputThumb[] = useMemo(() => {
    if (!v3Node) return [];
    const filterResult = filterAiV3InputSlots(v3Node.id, currentMode, edges, nodes);
    return filterResult.acceptedSlots.map((slot) => {
      const { sourceNode, type: finalType, value } = resolveStylePanelInput(slot, nodes, edges, nodeOutputs);

      const label =
        finalType === 'text' && slot.sourceNodeType === 'io'
          ? '文本'
          : slot.sourceNodeType === 'io'
            ? `文件${(slot.fileIdx ?? 0) + 1}`
            : finalType !== 'text'
              ? getNodeTypeLabel(finalType)
              : sourceNode?.type || '?';

      return { id: slot.id, type: finalType, label, value, sourceNodeId: slot.sourceNodeId, edgeId: slot.edgeId };
    });
  }, [v3Node, currentMode, edges, nodes, nodeOutputs]);

  // ── type-grouped per-item chips (match IoStylePanel upstream style) ──
  const typeGroups = useMemo(() => {
    if (!v3Node) return {} as Record<string, { sourceNodeId: string; sourceNodeLabel: string; items: InputThumb[] }[]>;
    const groups: Record<string, { sourceNodeId: string; sourceNodeLabel: string; items: InputThumb[] }[]> = {};
    const nodeInputOrder = readInputOrder(v3Node);

    for (const type of TYPE_ORDER_KEYS) {
      const typeInputs = rawInputs.filter((x) => x.type === type);
      if (typeInputs.length === 0) continue;

      const seenNodes = new Map<string, InputThumb[]>();
      for (const input of typeInputs) {
        const arr = seenNodes.get(input.sourceNodeId) ?? [];
        arr.push(input);
        seenNodes.set(input.sourceNodeId, arr);
      }

      const entries = Array.from(seenNodes.entries()).map(([sourceNodeId, items]) => {
        const src = nodes.find((n) => n.id === sourceNodeId);
        const srcDef = getNodeDef(src?.type || '');
        const nodeLabel =
          (typeof (src?.data as Record<string, unknown> | undefined)?.label === 'string'
            ? ((src?.data as Record<string, unknown>).label as string)
            : '') ||
          srcDef?.label ||
          sourceNodeId;
        return { sourceNodeId, sourceNodeLabel: nodeLabel, items };
      });

      // Apply per-type edge ordering from inputOrder
      const typeOrder = nodeInputOrder[type];
      if (typeOrder && typeOrder.length > 0) {
        const orderMap = new Map(typeOrder.map((eid, i) => [eid, i]));
        entries.sort((a, b) => {
          const ai = orderMap.get(a.items[0]?.edgeId || '');
          const bi = orderMap.get(b.items[0]?.edgeId || '');
          if (ai !== undefined && bi !== undefined) return ai - bi;
          if (ai !== undefined) return -1;
          if (bi !== undefined) return 1;
          return 0;
        });
      }

      groups[type] = entries;
    }

    return groups;
  }, [rawInputs, nodes, v3Node]);

  // ── 模型三级树（must be before early return to keep hook count stable）──
  const catLabels: Record<string, string> = { chat: '对话', image: '图像', video: '视频', midjourney: 'Midjourney' };
  const allModelOptions = [
    ...(availableModels.chat || []).map((m) => ({ ...m, _cat: 'chat' as const })),
    ...(availableModels.image || []).map((m) => ({ ...m, _cat: 'image' as const })),
    ...(availableModels.video || []).map((m) => ({ ...m, _cat: 'video' as const })),
    ...(availableModels.midjourney || []).map((m) => ({ ...m, _cat: 'midjourney' as const })),
  ];
  const modelTree: Array<{
    configName: string;
    configId: string;
    cats: Array<{ cat: string; label: string; models: typeof allModelOptions }>;
  }> = useMemo(() => {
    // 直接从 localStorage 读配置名，不依赖后端
    const localConfigs: ApiConfig[] = loadJSON('ai_configs', []);
    const configLabelMap = new Map(
      localConfigs.map((c, i) => [c.id, c.name?.trim() || c.base?.trim() || `API 配置 ${i + 1}`]),
    );

    const configs: Record<string, { configId: string; cats: Record<string, typeof allModelOptions> }> = {};
    for (const m of allModelOptions) {
      const configName = configLabelMap.get(m.configId || '') || m.configName || m.configId || '未命名';
      const configId = m.configId || '';
      if (!configs[configName]) configs[configName] = { configId, cats: {} };
      const cat = (m as typeof m & { _cat: string })._cat;
      const categoryModels = configs[configName].cats[cat] || [];
      categoryModels.push(m);
      configs[configName].cats[cat] = categoryModels;
    }
    const catOrder = ['chat', 'image', 'video', 'midjourney'];
    return Object.entries(configs).map(([configName, entry]) => ({
      configName,
      configId: entry.configId,
      cats: catOrder
        .filter((cat) => entry.cats[cat]?.length)
        .map((cat) => ({ cat, label: catLabels[cat] || cat, models: entry.cats[cat] })),
    }));
  }, [allModelOptions]);

  // ── pill value hints (must be before early return to keep hook count stable) ──
  const modelLabel = useMemo(() => {
    for (const cfg of modelTree) {
      for (const cat of cfg.cats) {
        const found = cat.models.find((m) => m.value === selectedModel || m.modelId === selectedModel);
        if (found) return found.label;
      }
    }
    return selectedModel || '选择模型';
  }, [modelTree, selectedModel]);

  const ratioHint = nodeData.ratio && nodeData.ratio !== 'auto' ? String(nodeData.ratio) : undefined;
  const sizeHint = nodeData.width && nodeData.height ? `${nodeData.width}x${nodeData.height}` : undefined;
  const formatHint =
    nodeData.output_format || (nodeData.resolution && nodeData.resolution !== 'auto')
      ? `${nodeData.resolution || ''} ${nodeData.output_format || 'png'}`.trim()
      : undefined;
  const durationHint = nodeData.duration ? `${nodeData.duration}s` : undefined;
  const videoResHint = nodeData.resolution && nodeData.resolution !== 'auto' ? String(nodeData.resolution) : undefined;
  const mjModeHint = nodeData.mjMode ? String(nodeData.mjMode) : undefined;
  const mjArHint = nodeData.mjAr ? String(nodeData.mjAr) : undefined;

  // ── early exit ──
  if (!v3Node) return null;

  // Keep ref for handleGroupReorder
  typeGroupsRef.current = typeGroups;

  const webSearchEnabled = Boolean(nodeData.enableWebSearch);

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
      {/* Input thumbnails — per-item preview (match IoStylePanel upstream style) */}
      {rawInputs.length > 0 &&
        (() => {
          // Flatten all type groups into one array for mixed rendering
          const flatGroups: { type: string; nodeGroup: (typeof typeGroups)[string][number]; gIdx: number }[] = [];
          for (const type of TYPE_ORDER_KEYS) {
            const groups = typeGroups[type];
            if (!groups) continue;
            for (let i = 0; i < groups.length; i++) {
              flatGroups.push({ type, nodeGroup: groups[i], gIdx: i });
            }
          }
          return (
            <div
              className="nodrag"
              style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap', cursor: 'default' }}
            >
              {flatGroups.map(({ type, nodeGroup, gIdx }) => (
                <div
                  key={`${type}-${nodeGroup.sourceNodeId}`}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedGroupIdx(gIdx);
                    setDraggedGroupType(type);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.stopPropagation();
                    if (draggedGroupType === type) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverGroupIdx(gIdx);
                    }
                  }}
                  onDragLeave={() => setDragOverGroupIdx(null)}
                  onDrop={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (draggedGroupIdx !== null && draggedGroupType === type && draggedGroupIdx !== gIdx)
                      handleGroupReorder(type, draggedGroupIdx, gIdx);
                    setDraggedGroupIdx(null);
                    setDragOverGroupIdx(null);
                    setDraggedGroupType(null);
                  }}
                  onDragEnd={() => {
                    setDraggedGroupIdx(null);
                    setDragOverGroupIdx(null);
                    setDraggedGroupType(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px 3px 4px',
                    borderRadius: 10,
                    background:
                      dragOverGroupIdx === gIdx && draggedGroupType === type ? 'var(--t-border)' : 'var(--t-bg2)',
                    border: '1px solid var(--t-border)',
                    cursor: 'grab',
                    opacity: draggedGroupIdx === gIdx && draggedGroupType === type ? 0.4 : 1,
                    transition: 'background 120ms ease, opacity 120ms ease',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)', flexShrink: 0 }}>
                    {type === 'image'
                      ? '图'
                      : type === 'video'
                        ? '视'
                        : type === 'audio'
                          ? '音'
                          : type === 'text'
                            ? '文'
                            : type}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: 'var(--t-text3)',
                      whiteSpace: 'nowrap',
                      maxWidth: 56,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                    }}
                  >
                    {nodeGroup.sourceNodeLabel}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {nodeGroup.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: 'var(--t-bg)',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--t-border)',
                        }}
                        title={item.type === 'text' ? item.value : item.label}
                      >
                        {(item.type === 'image' || item.type === 'video') && item.value ? (
                          <img
                            src={inferImageThumbnailUrl(item.value) || item.value}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : item.type === 'text' ? (
                          <span
                            style={{
                              fontSize: 8,
                              lineHeight: 1.2,
                              color: 'var(--t-text2)',
                              padding: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {String(item.value || '').slice(0, 30)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)' }}>
                            {item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '?'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      {/* ── CHAT MODE ── */}
      {currentMode === 'chat' && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
          <textarea
            className="nodrag nowheel"
            value={String(nodeData.systemPrompt || '')}
            onChange={(e) => setData({ systemPrompt: e.target.value })}
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
            placeholder="系统提示词（如：你是一个有帮助的 AI 助手）"
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setData({ enableWebSearch: !webSearchEnabled })}
              className="nodrag"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 10,
                border: webSearchEnabled ? '1px solid var(--node-color)' : '1px solid transparent',
                background: webSearchEnabled ? 'color-mix(in srgb, var(--node-color) 12%, transparent)' : 'transparent',
                color: webSearchEnabled ? 'var(--node-color)' : 'var(--t-text3)',
                cursor: 'pointer',
                transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
              title={webSearchEnabled ? '联网搜索已开启' : '联网搜索'}
            >
              <Globe size={14} />
            </button>
            <PopoverButton
              icon={<BoxSelect size={14} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector
                tree={modelTree}
                selectedModel={selectedModel}
                onSelect={(v) => handleModelChange(v)}
              />
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
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <PopoverButton
              icon={<BoxSelect size={14} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector
                tree={modelTree}
                selectedModel={selectedModel}
                onSelect={(v) => handleModelChange(v)}
              />
            </PopoverButton>
            <PopoverButton
              icon={<Grid3X3 size={14} />}
              label="比例"
              valueHint={ratioHint}
              open={openPopover === 'ratio'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'ratio' ? null : 'ratio')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  value={String(nodeData.ratio || 'auto')}
                  onChange={(e) => {
                    setData({ ratio: e.target.value });
                    setOpenPopover(null);
                  }}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {RATIO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>数量</div>
                  <input
                    type="number"
                    value={Number(nodeData.n ?? 1)}
                    min={1}
                    max={8}
                    onChange={(e) => setData({ n: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                    onBlur={() => setOpenPopover(null)}
                    className="nodrag"
                    style={{ ...fieldStyle, width: '100%' }}
                  />
                </div>
              </div>
            </PopoverButton>
            <PopoverButton
              icon={<Ruler size={14} />}
              label="尺寸"
              valueHint={sizeHint}
              open={openPopover === 'size'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'size' ? null : 'size')}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>宽</div>
                  <input
                    type="number"
                    value={Number(nodeData.width || 0) || ''}
                    min={16}
                    placeholder="auto"
                    onChange={(e) => setData({ width: Number(e.target.value) || 0 })}
                    onBlur={(e) => {
                      setData({ width: roundToNearest16(e.target.value) });
                      setOpenPopover(null);
                    }}
                    className="nodrag"
                    style={{ ...fieldStyle, width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>高</div>
                  <input
                    type="number"
                    value={Number(nodeData.height || 0) || ''}
                    min={16}
                    placeholder="auto"
                    onChange={(e) => setData({ height: Number(e.target.value) || 0 })}
                    onBlur={(e) => {
                      setData({ height: roundToNearest16(e.target.value) });
                      setOpenPopover(null);
                    }}
                    className="nodrag"
                    style={{ ...fieldStyle, width: '100%' }}
                  />
                </div>
              </div>
            </PopoverButton>
            <PopoverButton
              icon={<Image size={14} />}
              label="格式"
              valueHint={formatHint}
              open={openPopover === 'format'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'format' ? null : 'format')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                    输出档位
                  </div>
                  <select
                    value={String(nodeData.resolution || 'auto')}
                    onChange={(e) => {
                      setData({ resolution: e.target.value });
                      setOpenPopover(null);
                    }}
                    className="nodrag"
                    style={{ ...fieldStyle, width: '100%' }}
                  >
                    {RESOLUTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={String(nodeData.output_format || 'png')}
                  onChange={(e) => {
                    setData({ output_format: e.target.value });
                    setOpenPopover(null);
                  }}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
            placeholder="输入提示词（描述视频画面和运镜）..."
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <PopoverButton
              icon={<BoxSelect size={14} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector
                tree={modelTree}
                selectedModel={selectedModel}
                onSelect={(v) => handleModelChange(v)}
              />
            </PopoverButton>
            <PopoverButton
              icon={<Clock size={14} />}
              label="时长"
              valueHint={durationHint}
              open={openPopover === 'duration'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'duration' ? null : 'duration')}
            >
              <select
                value={String(nodeData.duration || 5)}
                onChange={(e) => {
                  setData({ duration: Number(e.target.value) });
                  setOpenPopover(null);
                }}
                className="nodrag"
                style={{ ...fieldStyle, width: '100%' }}
              >
                {VIDEO_DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </PopoverButton>
            <PopoverButton
              icon={<Ruler size={14} />}
              label="分辨率"
              valueHint={videoResHint}
              open={openPopover === 'resolution'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'resolution' ? null : 'resolution')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>比例</div>
                  <select
                    value={String(nodeData.ratio || 'auto')}
                    onChange={(e) => {
                      setData({ ratio: e.target.value });
                      setOpenPopover(null);
                    }}
                    className="nodrag"
                    style={{ ...fieldStyle, width: '100%' }}
                  >
                    {VIDEO_RATIO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={String(nodeData.resolution || '720p')}
                  onChange={(e) => {
                    setData({ resolution: e.target.value });
                    setOpenPopover(null);
                  }}
                  className="nodrag"
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  {VIDEO_RESOLUTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </PopoverButton>
          </div>
        </div>
      )}

      {/* ── MIDJOURNEY MODE ── */}
      {currentMode === 'midjourney' && (
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
          />
          <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <PopoverButton
              icon={<BoxSelect size={14} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector
                tree={modelTree}
                selectedModel={selectedModel}
                onSelect={(v) => handleModelChange(v)}
              />
            </PopoverButton>
            <PopoverButton
              icon={<Gauge size={14} />}
              label="模式"
              valueHint={mjModeHint}
              open={openPopover === 'mjMode'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'mjMode' ? null : 'mjMode')}
            >
              <select
                value={String(nodeData.mjMode || 'fast')}
                onChange={(e) => {
                  setData({ mjMode: e.target.value });
                  setOpenPopover(null);
                }}
                className="nodrag"
                style={{ ...fieldStyle, width: '100%' }}
              >
                <option value="fast">Fast</option>
                <option value="relax">Relax</option>
                <option value="turbo">Turbo</option>
              </select>
            </PopoverButton>
            <PopoverButton
              icon={<Ruler size={14} />}
              label="比例"
              valueHint={mjArHint}
              open={openPopover === 'mjAr'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'mjAr' ? null : 'mjAr')}
            >
              <select
                value={String(nodeData.mjAr || '1:1')}
                onChange={(e) => {
                  setData({ mjAr: e.target.value });
                  setOpenPopover(null);
                }}
                className="nodrag"
                style={{ ...fieldStyle, width: '100%' }}
              >
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="21:9">21:9</option>
                <option value="3:2">3:2</option>
                <option value="2:3">2:3</option>
              </select>
            </PopoverButton>
            <PopoverButton
              icon={<SlidersHorizontal size={14} />}
              label="参数"
              open={openPopover === 'mjParams'}
              direction="up"
              onToggle={() => setOpenPopover(openPopover === 'mjParams' ? null : 'mjParams')}
            >
              <div
                className="nodrag"
                style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 8 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                    版本 (--v)
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['', '8.1', '7', '6.1', 'niji 7', 'niji 6'].map((v) => {
                      const label = v === '' ? '默认' : v === 'niji 7' ? 'Niji7' : v === 'niji 6' ? 'Niji6' : `V${v}`;
                      const active = (nodeData.mjVersion || '') === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setData({ mjVersion: v || undefined })}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: active ? '1px solid var(--node-color)' : '1px solid var(--t-border)',
                            background: active
                              ? 'color-mix(in srgb, var(--node-color) 12%, transparent)'
                              : 'var(--t-bg2)',
                            color: active ? 'var(--node-color)' : 'var(--t-text3)',
                            fontSize: 11,
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'background 120ms, border-color 120ms',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                      种子 (--seed)
                    </div>
                    <input
                      type="number"
                      value={String(nodeData.mjSeed ?? '')}
                      placeholder="随机"
                      onChange={(e) => setData({ mjSeed: e.target.value ? Number(e.target.value) : undefined })}
                      className="nodrag"
                      style={{ ...fieldStyle, width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                      风格化 (--s)
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={String(nodeData.mjStylize ?? '')}
                      placeholder="100"
                      onChange={(e) =>
                        setData({
                          mjStylize: e.target.value ? Math.max(0, Math.min(1000, Number(e.target.value))) : undefined,
                        })
                      }
                      className="nodrag"
                      style={{ ...fieldStyle, width: '100%' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                      混乱度 (--c)
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={String(nodeData.mjChaos ?? '')}
                      placeholder="0"
                      onChange={(e) =>
                        setData({
                          mjChaos: e.target.value ? Math.max(0, Math.min(100, Number(e.target.value))) : undefined,
                        })
                      }
                      className="nodrag"
                      style={{ ...fieldStyle, width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-text3)', marginBottom: 5, fontWeight: 500 }}>
                      排除 (--no)
                    </div>
                    <input
                      type="text"
                      value={String(nodeData.mjNo || '')}
                      placeholder="text, watermark"
                      onChange={(e) => setData({ mjNo: e.target.value })}
                      className="nodrag"
                      style={{ ...fieldStyle, width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            </PopoverButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelTreeSelector({
  tree,
  selectedModel,
  onSelect,
}: {
  tree: Array<{
    configName: string;
    configId: string;
    cats: Array<{ cat: string; label: string; models: Array<{ label: string; value: string; modelId: string }> }>;
  }>;
  selectedModel: string;
  onSelect: (value: string) => void;
}) {
  const [collapsedConfigs, setCollapsedConfigs] = useState<Set<string>>(() => new Set(tree.map((c) => c.configName)));
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const cfg of tree) {
      for (const cat of cfg.cats) s.add(`${cfg.configName}:${cat.cat}`);
    }
    return s;
  });

  const toggleCat = (configName: string, cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      const key = `${configName}:${cat}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (tree.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--t-text3)', padding: 8, textAlign: 'center' }}>暂无可用模型</div>;
  }

  return (
    <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tree.map((config) => {
        const isCollapsed = collapsedConfigs.has(config.configName);
        return (
          <div key={config.configName}>
            <button
              type="button"
              onClick={() =>
                setCollapsedConfigs((prev) => {
                  const next = new Set(prev);
                  if (next.has(config.configName)) next.delete(config.configName);
                  else next.add(config.configName);
                  return next;
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 7,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--t-text2)',
                letterSpacing: '0.01em',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  transition: 'transform 0.15s',
                  transform: isCollapsed ? '' : 'rotate(90deg)',
                  flexShrink: 0,
                  opacity: 0.8,
                }}
              >
                ▶
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {config.configName}
              </span>
            </button>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12 }}>
                {config.cats.map((catGroup) => {
                  const catKey = `${config.configName}:${catGroup.cat}`;
                  const isCatCollapsed = collapsedCats.has(catKey);
                  return (
                    <div key={catGroup.cat} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        type="button"
                        onClick={() => toggleCat(config.configName, catGroup.cat)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          width: '100%',
                          padding: '3px 6px',
                          borderRadius: 5,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 10,
                          color: 'var(--t-text3)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            transition: 'transform 0.15s',
                            transform: isCatCollapsed ? '' : 'rotate(90deg)',
                            flexShrink: 0,
                            opacity: 0.6,
                          }}
                        >
                          ▶
                        </span>
                        {catGroup.label}
                      </button>
                      {!isCatCollapsed &&
                        catGroup.models.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => onSelect(m.value)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '5px 9px 5px 16px',
                              borderRadius: 6,
                              border: 'none',
                              cursor: 'pointer',
                              background:
                                m.value === selectedModel || m.modelId === selectedModel
                                  ? 'color-mix(in srgb, var(--node-color) 12%, transparent)'
                                  : 'transparent',
                              color:
                                m.value === selectedModel || m.modelId === selectedModel
                                  ? 'var(--node-color)'
                                  : 'var(--t-text)',
                              fontSize: 13,
                              fontFamily: 'var(--font-sans)',
                              fontWeight: m.value === selectedModel || m.modelId === selectedModel ? 500 : 400,
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PopoverButton({
  icon,
  label,
  valueHint,
  open,
  direction,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  valueHint?: string;
  open: boolean;
  direction: 'up' | 'down';
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const displayValue = valueHint || label;
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        className="nodrag"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 28,
          padding: '0 8px 0 6px',
          borderRadius: 9,
          border: open
            ? '1px solid color-mix(in srgb, var(--t-border) 80%, transparent)'
            : '1px solid color-mix(in srgb, var(--t-border) 50%, transparent)',
          background: open
            ? 'color-mix(in srgb, var(--t-bg2) 72%, transparent)'
            : 'color-mix(in srgb, var(--t-bg2) 55%, transparent)',
          backdropFilter: open ? 'blur(14px)' : 'blur(8px)',
          color: open ? 'var(--t-text)' : 'var(--t-text2)',
          fontSize: 11,
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease',
          boxShadow: open ? '0 2px 12px rgba(0,0,0,0.08)' : 'none',
        }}
        title={label}
      >
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.75 }}>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 64 }}>{displayValue}</span>
        <span
          style={{
            fontSize: 8,
            opacity: 0.45,
            flexShrink: 0,
            marginLeft: 1,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : '',
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 31 }} onClick={onToggle} />
          <div
            className="nodrag"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              ...(direction === 'up' ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 8 }),
              right: 0,
              minWidth: 260,
              borderRadius: 16,
              background: 'color-mix(in srgb, var(--t-card) 94%, transparent)',
              backdropFilter: 'blur(48px) saturate(180%)',
              border: '1px solid color-mix(in srgb, var(--t-border) 72%, transparent)',
              boxShadow:
                direction === 'up'
                  ? '0 -12px 48px rgba(0,0,0,0.14), 0 -1px 0 rgba(255,255,255,0.07) inset'
                  : '0 16px 48px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.07) inset',
              zIndex: 32,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '13px 16px 10px',
                borderBottom: '1px solid color-mix(in srgb, var(--t-border) 28%, transparent)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--t-text2)', opacity: 0.75 }}>
                {icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', fontFamily: 'var(--font-sans)' }}>
                {label}
              </span>
            </div>
            <div style={{ padding: 12 }}>{children}</div>
          </div>
        </>
      )}
    </div>
  );
}
