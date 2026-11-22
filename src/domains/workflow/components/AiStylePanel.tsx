import { NodeInputAttachments } from './nodes/WorkflowContentPrimitives';
import { TextComposer } from '@/ui/TextComposer';
import { resolveWorkflowConnections } from '@/domains/workflow/lib/executionGraph';
import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import {
  StylePanelPopoverButton,
  WorkflowStylePanelShell,
} from '@/domains/workflow/components/WorkflowStylePanelShell';
import { resolveStylePanelInput } from '@/domains/workflow/components/stylePanelInputResolver';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { type InputOrderMap, filterAiInputSlots, readInputOrder } from '@/domains/workflow/lib/store/helpers';
import { loadJSON } from '@/shared/runtime';
import type { ApiConfig } from '@/shared/types';
import {
  Clock,
  Crosshair,
  Gauge,
  Globe,
  GridNine,
  Image,
  Ruler,
  SpeakerHigh,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ModelTreeSelector from './ModelTreeSelector';
import { ChoiceGroup, ControlField, MenuGroup, MenuItem, MenuTrigger } from '@/ui/MenuPrimitives';

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
  { label: '512PX', value: '512px' },
  { label: '1K', value: '1k' },
  { label: '2K', value: '2k' },
  { label: '4K', value: '4k' },
];

const FORMAT_OPTIONS = [
  { label: 'PNG', value: 'png' },
  { label: 'JPEG', value: 'jpeg' },
  { label: 'WEBP', value: 'webp' },
];

const VIDEO_DURATION_OPTIONS = [
  { label: '自动', value: '-1' },
  { label: '4 秒', value: '4' },
  { label: '5 秒', value: '5' },
  { label: '6 秒', value: '6' },
  { label: '7 秒', value: '7' },
  { label: '8 秒', value: '8' },
  { label: '9 秒', value: '9' },
  { label: '10 秒', value: '10' },
  { label: '11 秒', value: '11' },
  { label: '12 秒', value: '12' },
  { label: '13 秒', value: '13' },
  { label: '14 秒', value: '14' },
  { label: '15 秒', value: '15' },
];

const VIDEO_RATIO_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

const MIDJOURNEY_MODE_OPTIONS = [
  { label: 'Fast', value: 'fast' },
  { label: 'Relax', value: 'relax' },
  { label: 'Turbo', value: 'turbo' },
];

const MIDJOURNEY_RATIO_OPTIONS = [
  ...RATIO_OPTIONS.filter(({ value }) => value !== 'auto'),
  { label: '21:9', value: '21:9' },
];

const MIDJOURNEY_VERSION_OPTIONS = [
  { label: '默认', value: '' },
  { label: 'V8.1', value: '8.1' },
  { label: 'V7', value: '7' },
  { label: 'V6.1', value: '6.1' },
  { label: 'Niji7', value: 'niji 7' },
  { label: 'Niji6', value: 'niji 6' },
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

export default function AiStylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const canvasEdges = useWorkflowStore((s) => s.edges);
  const edges = useMemo(() => resolveWorkflowConnections(nodes, canvasEdges), [nodes, canvasEdges]);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  // Only show panel when exactly one panel-capable node is selected across all types
  const v3Node = (() => {
    const selectedPanelNodes = nodes.filter((n) => n.selected && (n.type === 'io' || n.type === 'ai'));
    if (selectedPanelNodes.length !== 1) return null;
    return selectedPanelNodes[0].type === 'ai' ? selectedPanelNodes[0] : null;
  })();

  const [openPopover, setOpenPopover] = useState<string | null>(null);
  useEffect(() => setOpenPopover(null), [v3Node?.id]);
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
      if ((availableModels.audio || []).some((m) => isModelMatch(m, modelValue))) return 'audio';
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
    const filterResult = filterAiInputSlots(v3Node.id, currentMode, edges, nodes);
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
  const catLabels: Record<string, string> = {
    chat: '对话',
    image: '图像',
    video: '视频',
    audio: '音频',
    midjourney: 'Midjourney',
  };
  const allModelOptions = [
    ...(availableModels.chat || []).map((m) => ({ ...m, _cat: 'chat' as const })),
    ...(availableModels.image || []).map((m) => ({ ...m, _cat: 'image' as const })),
    ...(availableModels.audio || []).map((m) => ({ ...m, _cat: 'audio' as const })),
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

    const configs = new Map<string, { configName: string; cats: Record<string, typeof allModelOptions> }>();
    for (const m of allModelOptions) {
      const configName = configLabelMap.get(m.configId || '') || m.configName || m.configId || '未命名';
      const configId = m.configId || '';
      const config = configs.get(configId) || { configName, cats: {} };
      (config.cats[m._cat] ??= []).push(m);
      configs.set(configId, config);
    }
    const catOrder = ['chat', 'image', 'video', 'audio', 'midjourney'];
    return Array.from(configs, ([configId, entry]) => ({
      configName: entry.configName,
      configId,
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
  const storedImageResolution = String(nodeData.imageResolution ?? nodeData.resolution ?? '')
    .trim()
    .toLowerCase();
  const imageResolution = RESOLUTION_OPTIONS.find(({ value }) => value === storedImageResolution)?.value || 'auto';
  const imageFormat = String(nodeData.output_format || 'png');
  const sizeHint =
    nodeData.width || nodeData.height ? `${nodeData.width || '自动'} × ${nodeData.height || '自动'}` : '自动';
  const formatHint =
    imageResolution === 'auto'
      ? imageFormat.toUpperCase()
      : `${imageResolution.toUpperCase()} · ${imageFormat.toUpperCase()}`;
  const videoDuration = String(nodeData.duration || 5);
  const durationHint =
    VIDEO_DURATION_OPTIONS.find(({ value }) => value === videoDuration)?.label || `${videoDuration} 秒`;
  const mjMode = String(nodeData.mjMode || 'fast');
  const mjModeHint = MIDJOURNEY_MODE_OPTIONS.find(({ value }) => value === mjMode)?.label || mjMode;
  const mjAr = String(nodeData.mjAr || '1:1');

  const webSearchEnabled = nodeData.enableWebSearch === true;

  // ── early exit ──
  if (!v3Node) return null;

  // Keep ref for handleGroupReorder
  typeGroupsRef.current = typeGroups;

  return (
    <WorkflowStylePanelShell>
      {rawInputs.length > 0 && (
        <NodeInputAttachments groups={typeGroups} onReorder={handleGroupReorder}
          resolveThumbnail={inferImageThumbnailUrl} />
      )}

      {/* ── CHAT MODE ── */}
      {currentMode === 'chat' && (
        <TextComposer
          className="node-text-composer"
          label="系统提示词"
          textareaProps={{
            value: String(nodeData.systemPrompt || ''),
            onChange: (e) => setData({ systemPrompt: e.target.value }),
            className: 'nodrag nowheel',
            placeholder: '系统提示词（如：你是一个有帮助的 AI 助手）',
            onPointerDown: (e) => e.stopPropagation(),
          }}
        >
          <div className="nodrag ai-parameter-toolbar" aria-label="文本参数" role="group">
            <MenuTrigger
              icon={<Globe size={16} />}
              label="联网搜索"
              onClick={() => setData({ enableWebSearch: !webSearchEnabled })}
              className="nodrag"
              aria-pressed={webSearchEnabled}
              title={webSearchEnabled ? '联网搜索已开启' : '联网搜索'}
            />
            <StylePanelPopoverButton
              icon={<Crosshair size={15} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector tree={modelTree} selectedModel={selectedModel} onSelect={handleModelChange} />
            </StylePanelPopoverButton>
          </div>
        </TextComposer>
      )}

      {/* ── IMAGE MODE ── */}
      {currentMode === 'image' && (
        <TextComposer
          className="node-text-composer"
          label="生成提示词"
          textareaProps={{
            value: promptValue,
            onChange: (e) => {
              setPromptValue(e.target.value);
              setData({ prompt: e.target.value });
            },
            className: 'nodrag nowheel',
            placeholder: '输入提示词...',
            onPointerDown: (e) => e.stopPropagation(),
          }}
        >
          <div className="nodrag ai-parameter-toolbar" aria-label="图像生成参数" role="group">
            <StylePanelPopoverButton
              icon={<Crosshair size={15} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector tree={modelTree} selectedModel={selectedModel} onSelect={handleModelChange} />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<GridNine size={15} />}
              label="比例"
              valueHint={ratioHint || '自动'}
              open={openPopover === 'ratio'}
              onToggle={() => setOpenPopover(openPopover === 'ratio' ? null : 'ratio')}
            >
              <ParameterChoices
                label="画面比例"
                options={RATIO_OPTIONS}
                value={String(nodeData.ratio || 'auto')}
                onChange={(ratio) => setData({ ratio })}
                showRatio
              />
              <MenuGroup label="生成数量">
                <ControlField label="1–8 张" inline>
                  <input
                    aria-label="生成数量"
                    type="number"
                    value={Number(nodeData.n ?? 1)}
                    min={1}
                    max={8}
                    onChange={(e) => setData({ n: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                  />
                </ControlField>
              </MenuGroup>
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<Ruler size={15} />}
              label="尺寸"
              valueHint={sizeHint}
              open={openPopover === 'size'}
              onToggle={() => setOpenPopover(openPopover === 'size' ? null : 'size')}
            >
              <MenuGroup label="输出尺寸">
                <div className="ai-parameter-dimensions">
                  {(['width', 'height'] as const).map((axis) => (
                    <ControlField key={axis} label={axis === 'width' ? '宽度（px）' : '高度（px）'}>
                      <input
                        type="number"
                        value={Number(nodeData[axis] || 0) || ''}
                        min={16}
                        step={16}
                        placeholder="自动"
                        onChange={(e) => setData({ [axis]: Number(e.target.value) || 0 })}
                        onBlur={(e) => setData({ [axis]: roundToNearest16(e.target.value) })}
                      />
                    </ControlField>
                  ))}
                </div>
                <p className="ai-parameter-note">留空使用自动尺寸，输入值会取整为 16 的倍数。</p>
                <MenuItem className="ui-choice-action" onClick={() => setData({ width: 0, height: 0 })}>
                  恢复自动尺寸
                </MenuItem>
              </MenuGroup>
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<Image size={15} />}
              label="格式"
              valueHint={formatHint}
              open={openPopover === 'format'}
              onToggle={() => setOpenPopover(openPopover === 'format' ? null : 'format')}
            >
              <ParameterChoices
                label="输出档位"
                options={RESOLUTION_OPTIONS}
                value={imageResolution}
                onChange={(imageResolution) => setData({ imageResolution })}
              />
              <ParameterChoices
                label="文件格式"
                options={FORMAT_OPTIONS}
                value={imageFormat}
                onChange={(output_format) => setData({ output_format })}
              />
            </StylePanelPopoverButton>
          </div>
        </TextComposer>
      )}

      {/* ── VIDEO MODE ── */}
      {currentMode === 'video' && (
        <TextComposer
          className="node-text-composer"
          label="生成提示词"
          textareaProps={{
            value: promptValue,
            onChange: (e) => {
              setPromptValue(e.target.value);
              setData({ prompt: e.target.value });
            },
            className: 'nodrag nowheel',
            placeholder: '输入提示词（描述视频画面和运镜）...',
            onPointerDown: (e) => e.stopPropagation(),
          }}
        >
          <div className="nodrag ai-parameter-toolbar" aria-label="视频生成参数" role="group">
            <StylePanelPopoverButton
              icon={<Crosshair size={15} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector tree={modelTree} selectedModel={selectedModel} onSelect={handleModelChange} />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<Clock size={15} />}
              label="时长"
              valueHint={durationHint}
              open={openPopover === 'duration'}
              onToggle={() => setOpenPopover(openPopover === 'duration' ? null : 'duration')}
            >
              <ParameterChoices
                label="视频时长"
                options={VIDEO_DURATION_OPTIONS}
                value={videoDuration}
                onChange={(duration) => setData({ duration: Number(duration) })}
              />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<GridNine size={15} />}
              label="比例"
              valueHint={ratioHint || '自动'}
              open={openPopover === 'ratio'}
              onToggle={() => setOpenPopover(openPopover === 'ratio' ? null : 'ratio')}
            >
              <ParameterChoices
                label="画面比例"
                options={VIDEO_RATIO_OPTIONS}
                value={String(nodeData.ratio || 'auto')}
                onChange={(ratio) => setData({ ratio })}
                showRatio
              />
            </StylePanelPopoverButton>
          </div>
        </TextComposer>
      )}

      {currentMode === 'audio' && (
        <TextComposer
          className="node-text-composer"
          label="合成文本"
          textareaProps={{
            'aria-label': '合成文本',
            value: promptValue,
            onChange: (event) => {
              setPromptValue(event.target.value);
              setData({ prompt: event.target.value });
            },
            className: 'nodrag nowheel',
            placeholder: '输入要合成的文本，或连接上游文本节点',
            onPointerDown: (event) => event.stopPropagation(),
          }}
        >
          <div className="nodrag ai-parameter-toolbar" aria-label="语音合成参数" role="group">
            <StylePanelPopoverButton
              icon={<Crosshair size={15} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector tree={modelTree} selectedModel={selectedModel} onSelect={handleModelChange} />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<SpeakerHigh size={15} />}
              label="音色"
              valueHint={String(nodeData.voice || 'alloy')}
              open={openPopover === 'voice'}
              onToggle={() => setOpenPopover(openPopover === 'voice' ? null : 'voice')}
            >
              <ControlField label="音色标识">
                <input
                  className="nodrag"
                  value={String(nodeData.voice ?? '')}
                  placeholder="alloy"
                  onChange={(event) => setData({ voice: event.target.value })}
                />
              </ControlField>
            </StylePanelPopoverButton>
          </div>
        </TextComposer>
      )}

      {/* ── MIDJOURNEY MODE ── */}
      {currentMode === 'midjourney' && (
        <TextComposer
          className="node-text-composer"
          label="生成提示词"
          textareaProps={{
            value: promptValue,
            onChange: (e) => {
              setPromptValue(e.target.value);
              setData({ prompt: e.target.value });
            },
            className: 'nodrag nowheel',
            placeholder: '输入提示词...',
            onPointerDown: (e) => e.stopPropagation(),
          }}
        >
          <div className="nodrag ai-parameter-toolbar" aria-label="Midjourney 参数" role="group">
            <StylePanelPopoverButton
              icon={<Crosshair size={15} />}
              label="模型"
              valueHint={modelLabel}
              open={openPopover === 'model'}
              onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
            >
              <ModelTreeSelector tree={modelTree} selectedModel={selectedModel} onSelect={handleModelChange} />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<Gauge size={15} />}
              label="模式"
              valueHint={mjModeHint}
              open={openPopover === 'mjMode'}
              onToggle={() => setOpenPopover(openPopover === 'mjMode' ? null : 'mjMode')}
            >
              <ParameterChoices
                label="生成模式"
                options={MIDJOURNEY_MODE_OPTIONS}
                value={mjMode}
                onChange={(mjMode) => setData({ mjMode })}
              />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<Ruler size={15} />}
              label="比例"
              valueHint={mjAr}
              open={openPopover === 'mjAr'}
              onToggle={() => setOpenPopover(openPopover === 'mjAr' ? null : 'mjAr')}
            >
              <ParameterChoices
                label="画面比例"
                options={MIDJOURNEY_RATIO_OPTIONS}
                value={mjAr}
                onChange={(mjAr) => setData({ mjAr })}
                showRatio
              />
            </StylePanelPopoverButton>
            <StylePanelPopoverButton
              icon={<SlidersHorizontal size={15} />}
              label="参数"
              open={openPopover === 'mjParams'}
              onToggle={() => setOpenPopover(openPopover === 'mjParams' ? null : 'mjParams')}
            >
              <ParameterChoices
                label="版本 (--v)"
                options={MIDJOURNEY_VERSION_OPTIONS}
                value={String(nodeData.mjVersion || '')}
                onChange={(mjVersion) => setData({ mjVersion: mjVersion || undefined })}
              />
              <MenuGroup label="生成参数">
                <div className="ai-parameter-dimensions">
                  <ControlField label="种子 (--seed)">
                    <input
                      type="number"
                      value={String(nodeData.mjSeed ?? '')}
                      placeholder="随机"
                      onChange={(e) => setData({ mjSeed: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </ControlField>
                  <ControlField label="风格化 (--s)">
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
                    />
                  </ControlField>
                </div>
                <div className="ai-parameter-dimensions">
                  <ControlField label="混乱度 (--c)">
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
                    />
                  </ControlField>
                  <ControlField label="排除 (--no)">
                    <input
                      type="text"
                      value={String(nodeData.mjNo || '')}
                      placeholder="text, watermark"
                      onChange={(e) => setData({ mjNo: e.target.value })}
                    />
                  </ControlField>
                </div>
              </MenuGroup>
            </StylePanelPopoverButton>
          </div>
        </TextComposer>
      )}
    </WorkflowStylePanelShell>
  );
}

function ParameterChoices({
  label,
  options,
  value,
  onChange,
  showRatio = false,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  showRatio?: boolean;
}) {
  return (
    <ChoiceGroup
      label={label}
      options={options.map((option) => ({ ...option, label: option.value === 'auto' ? '自动' : option.label }))}
      value={value}
      onChange={onChange}
      columns={showRatio ? 4 : undefined}
      renderIcon={
        showRatio
          ? (ratio) => {
              const [width, height] = ratio.split(':').map(Number);
              const longestSide = Math.max(width, height);
              return longestSide ? (
                <span
                  className="workflow-ratio-preview"
                  style={{ width: (20 * width) / longestSide, height: (20 * height) / longestSide }}
                />
              ) : (
                <SlidersHorizontal size={16} />
              );
            }
          : undefined
      }
    />
  );
}
