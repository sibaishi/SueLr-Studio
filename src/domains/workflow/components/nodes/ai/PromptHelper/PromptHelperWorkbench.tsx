import {
  PROMPT_HELPER_CAMERA_EDIT_STRATEGIES,
  PROMPT_HELPER_CAMERA_MODES,
  LAYOUT_TEMPLATE_PRESETS,
  PROMPT_HELPER_MODEL_STYLES,
  PROMPT_HELPER_TOOLS,
  type PromptHelperData,
  type PromptHelperModelStyle,
  type PromptHelperTool,
  STORYBOARD_LAYOUT_PRESETS,
  STORYBOARD_STYLE_PRESETS,
  buildPromptHelperPrompt,
  getPromptHelperToolLabel,
  normalizePromptHelperData,
  summarizePromptHelper,
} from '@/shared/workflow/prompt-helper';
import { Camera, Lightbulb, Plus, Rows3, SquareMousePointer, Trash2, X } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

type PromptHelperPatch = Partial<PromptHelperData>;
type PromptHelperPoint = PromptHelperData['cameraConfig']['position'];

const TOOL_ITEMS: Array<{ id: PromptHelperTool; label: string; icon: typeof Camera }> = [
  { id: PROMPT_HELPER_TOOLS.camera, label: '转换视角', icon: Camera },
  { id: PROMPT_HELPER_TOOLS.lighting, label: '调整光照', icon: Lightbulb },
  { id: PROMPT_HELPER_TOOLS.storyboard, label: '生成分镜图', icon: Rows3 },
  { id: PROMPT_HELPER_TOOLS.layout, label: '生成三视图', icon: SquareMousePointer },
];

const LIGHT_TYPE_LABELS: Record<string, string> = {
  area: '区域光',
  directional: '平行光',
  spot: '聚光灯',
};

const MODEL_STYLE_ITEMS = [
  { id: PROMPT_HELPER_MODEL_STYLES.generic, label: '通用', description: '中英混合，适合多数图片模型' },
  { id: PROMPT_HELPER_MODEL_STYLES.gptImage2, label: 'GPT-image-2', description: '短句、明确、直接' },
  { id: PROMPT_HELPER_MODEL_STYLES.nanoBanana, label: 'Nano Banana', description: '结构化字段 + final_prompt' },
];

const CAMERA_MODE_ITEMS = [
  { id: PROMPT_HELPER_CAMERA_MODES.edit, label: '调整现有图片视角' },
  { id: PROMPT_HELPER_CAMERA_MODES.generate, label: '新生成该视角图片' },
];

const CAMERA_EDIT_STRATEGY_ITEMS = [
  { id: PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.cameraRotate, label: '摄像机旋转' },
  { id: PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.subjectRotate, label: '主体旋转' },
];

const LAYOUT_SUBJECT_KIND_OPTIONS = [
  { id: 'character', label: '角色' },
  { id: 'product', label: '产品' },
  { id: 'object', label: '物体' },
];

const LAYOUT_BLOCK_KIND_OPTIONS = [
  { id: 'front', label: '正面' },
  { id: 'side', label: '侧面' },
  { id: 'back', label: '背面' },
  { id: 'detail', label: '细节' },
  { id: 'material', label: '材质' },
  { id: 'color', label: '颜色变体' },
  { id: 'pose', label: '姿态' },
  { id: 'label', label: 'Logo/标签' },
  { id: 'custom', label: '自定义' },
];

const LAYOUT_BLOCK_PRIORITY_OPTIONS = [
  { id: 'primary', label: '主要' },
  { id: 'secondary', label: '次要' },
  { id: 'reference', label: '参考' },
];

const STORYBOARD_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '2.35:1'];

const STORYBOARD_GRID_COLUMNS: Record<string, number> = {
  'grid-4': 2,
  'grid-6': 3,
  'grid-9': 3,
  'vertical-3': 1,
  'vertical-6': 2,
  'vertical-9': 3,
};

function getStoryboardLayoutPreset(layoutPreset: string) {
  return STORYBOARD_LAYOUT_PRESETS.find((item) => item.id === layoutPreset) || STORYBOARD_LAYOUT_PRESETS[0];
}

function getStoryboardPreviewRatio(aspectRatio: string) {
  const [width, height] = aspectRatio.split(':').map((part) => Number(part));
  return width > 0 && height > 0 ? `${width} / ${height}` : '16 / 9';
}

function circledNumber(index: number) {
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
  return circled[index] || String(index + 1);
}

export function PromptHelperNodeCard({
  data,
  outputs,
  onOpen,
}: {
  data: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  onOpen: () => void;
}) {
  const normalized = normalizePromptHelperData(data);
  const prompt = String(outputs?.prompt || buildPromptHelperPrompt(normalized));
  return (
    <div className="node-content-shell prompt-helper-card">
      <div className="prompt-helper-card__top">
        <span className="prompt-helper-card__badge">{getPromptHelperToolLabel(normalized.activeTool)}</span>
        <span>{summarizePromptHelper(normalized)}</span>
      </div>
      <div className="prompt-helper-card__preview">{prompt}</div>
      <button type="button" className="prompt-helper-card__button nodrag" onClick={onOpen}>
        打开工作台
      </button>
    </div>
  );
}

export function PromptHelperWorkbenchModal({
  data,
  onPatch,
  onClose,
}: {
  data: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const normalized = normalizePromptHelperData(data);
  const prompt = buildPromptHelperPrompt(normalized);
  const patch = (next: PromptHelperPatch) => onPatch(next as Record<string, unknown>);

  return createPortal(
    <div
      className="prompt-helper-workbench"
      role="dialog"
      aria-modal="true"
      aria-label="辅助提示词工作台"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="prompt-helper-workbench__dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="prompt-helper-workbench__header">
          <div>
            <div className="prompt-helper-workbench__eyebrow">辅助提示词</div>
            <div className="prompt-helper-workbench__title">{getPromptHelperToolLabel(normalized.activeTool)}</div>
          </div>
          <button type="button" className="prompt-helper-workbench__icon" onClick={onClose} aria-label="关闭工作台">
            <X size={18} />
          </button>
        </header>

        <div className="prompt-helper-workbench__tabs">
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className={['prompt-helper-workbench__tab', normalized.activeTool === tool.id ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => patch({ activeTool: tool.id })}
              >
                <Icon size={15} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>

        <main className="prompt-helper-workbench__body">
          <section className="prompt-helper-workbench__editor">
            {normalized.activeTool === PROMPT_HELPER_TOOLS.lighting ? (
              <LightingTool data={normalized} onPatch={patch} />
            ) : normalized.activeTool === PROMPT_HELPER_TOOLS.storyboard ? (
              <StoryboardTool data={normalized} onPatch={patch} />
            ) : normalized.activeTool === PROMPT_HELPER_TOOLS.layout ? (
              <LayoutTool data={normalized} onPatch={patch} />
            ) : (
              <CameraTool data={normalized} onPatch={patch} />
            )}
          </section>
          <aside className="prompt-helper-workbench__preview">
            <label className="prompt-helper-field prompt-helper-field--wide">
              <span>模型倾向</span>
              <select
                value={normalized.modelStyle}
                onChange={(event) => patch({ modelStyle: event.target.value as PromptHelperModelStyle })}
              >
                {MODEL_STYLE_ITEMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} - {item.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="prompt-helper-field prompt-helper-field--wide">
              <span>基础画面描述</span>
              <textarea
                value={normalized.baseText}
                onChange={(event) => patch({ baseText: event.target.value })}
                placeholder="可选：描述主体、场景或原始需求；连接上游文本时以上游输入为准"
              />
            </label>
            <div className="prompt-helper-workbench__prompt-title">实时输出</div>
            <pre className="prompt-helper-workbench__prompt">{prompt}</pre>
          </aside>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function CameraTool({ data, onPatch }: { data: PromptHelperData; onPatch: (patch: PromptHelperPatch) => void }) {
  const config = data.cameraConfig;
  const patchCamera = (patch: Partial<typeof config>) => onPatch({ cameraConfig: { ...config, ...patch } });
  const isGenerateMode = config.mode === PROMPT_HELPER_CAMERA_MODES.generate;
  const pointFromOrbit = (distance: number, angle: number, height: number): PromptHelperPoint => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: Number((Math.sin(radians) * distance).toFixed(1)),
      y: Number(height.toFixed(1)),
      z: Number((Math.cos(radians) * distance).toFixed(1)),
    };
  };
  const orbitFromPoint = (position: PromptHelperPoint) => ({
    distance: Number(Math.max(1, Math.hypot(position.x, position.z)).toFixed(1)),
    angle: Number(((Math.atan2(position.x, position.z) * 180) / Math.PI).toFixed(0)),
    height: Number(position.y.toFixed(1)),
  });
  const patchOrbit = (patch: Partial<Pick<typeof config, 'distance' | 'angle' | 'height'>>) => {
    const distance = patch.distance ?? config.distance;
    const angle = patch.angle ?? config.angle;
    const height = patch.height ?? config.height;
    patchCamera({ ...patch, position: pointFromOrbit(distance, angle, height) });
  };
  const patchPosition = (axis: 'x' | 'y' | 'z', value: number) => {
    const position = { ...config.position, [axis]: value };
    patchCamera({ position, ...orbitFromPoint(position) });
  };
  const patchPositionFromScene = (position: PromptHelperPoint) => {
    patchCamera({ position, ...orbitFromPoint(position) });
  };

  return (
    <div className="prompt-helper-tool">
      <ThreeScene cameraConfig={config} interactionMode="camera" onCameraPositionChange={patchPositionFromScene} />
      <div className="prompt-helper-controls">
        <div className="prompt-helper-segmented">
          {CAMERA_MODE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={config.mode === item.id ? 'is-active' : ''}
              onClick={() => patchCamera({ mode: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!isGenerateMode ? (
          <div className="prompt-helper-segmented">
            {CAMERA_EDIT_STRATEGY_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={config.editStrategy === item.id ? 'is-active' : ''}
                onClick={() => patchCamera({ editStrategy: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <label className="prompt-helper-field">
          <span>景别</span>
          <select value={config.shotSize} onChange={(event) => patchCamera({ shotSize: event.target.value })}>
            {['远景', '全景', '中景', '近景', '特写'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="焦距 mm"
          value={config.focalLength}
          min={12}
          max={120}
          onChange={(value) => patchCamera({ focalLength: value })}
        />
        <NumberField
          label="距离 m"
          value={config.distance}
          min={1}
          max={20}
          step={0.5}
          onChange={(value) => patchOrbit({ distance: value })}
        />
        <NumberField
          label="角度 °"
          value={config.angle}
          min={-180}
          max={180}
          onChange={(value) => patchOrbit({ angle: value })}
        />
        <NumberField
          label="高度 m"
          value={config.height}
          min={0}
          max={6}
          step={0.1}
          onChange={(value) => patchOrbit({ height: value })}
        />
        <NumberField
          label="X"
          value={config.position.x}
          min={-8}
          max={8}
          step={0.1}
          onChange={(value) => patchPosition('x', value)}
        />
        <NumberField
          label="Y"
          value={config.position.y}
          min={0}
          max={8}
          step={0.1}
          onChange={(value) => patchPosition('y', value)}
        />
        <NumberField
          label="Z"
          value={config.position.z}
          min={-8}
          max={8}
          step={0.1}
          onChange={(value) => patchPosition('z', value)}
        />
      </div>
    </div>
  );
}

function LightingTool({ data, onPatch }: { data: PromptHelperData; onPatch: (patch: PromptHelperPatch) => void }) {
  const config = data.lightingConfig;
  const cameraConfig = data.cameraConfig;
  const patchLighting = (patch: Partial<typeof config>) => onPatch({ lightingConfig: { ...config, ...patch } });
  const updateLight = (index: number, patch: Record<string, unknown>) => {
    patchLighting({
      lights: config.lights.map((light, lightIndex) => (lightIndex === index ? { ...light, ...patch } : light)),
    });
  };
  const directionToTarget = (position: PromptHelperPoint): PromptHelperPoint => {
    const vector = {
      x: cameraConfig.target.x - position.x,
      y: cameraConfig.target.y - position.y,
      z: cameraConfig.target.z - position.z,
    };
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    return {
      x: Number((vector.x / length).toFixed(2)),
      y: Number((vector.y / length).toFixed(2)),
      z: Number((vector.z / length).toFixed(2)),
    };
  };
  const updateLightPosition = (index: number, position: PromptHelperPoint) => {
    updateLight(index, { position, direction: directionToTarget(position) });
  };
  const addLight = () => {
    const index = config.lights.length + 1;
    const position = { x: index - 2, y: 3, z: 3 };
    patchLighting({
      lights: [
        ...config.lights,
        {
          id: `light-${Date.now()}`,
          type: 'area',
          name: `灯光 ${index}`,
          intensity: 1,
          color: '#ffffff',
          position,
          direction: directionToTarget(position),
        },
      ],
    });
  };

  return (
    <div className="prompt-helper-tool">
      <ThreeScene
        cameraConfig={cameraConfig}
        lights={config.lights}
        interactionMode="lighting"
        onLightPositionChange={(lightId, position) => {
          const index = config.lights.findIndex((light) => light.id === lightId);
          if (index >= 0) updateLightPosition(index, position);
        }}
        onLightDirectionChange={(lightId, direction) => {
          const index = config.lights.findIndex((light) => light.id === lightId);
          if (index >= 0) updateLight(index, { direction });
        }}
      />
      <div className="prompt-helper-controls prompt-helper-controls--lights">
        <div className="prompt-helper-segmented">
          <button
            type="button"
            className={config.mode === 'add' ? 'is-active' : ''}
            onClick={() => patchLighting({ mode: 'add' })}
          >
            增加光线
          </button>
          <button
            type="button"
            className={config.mode === 'reshape' ? 'is-active' : ''}
            onClick={() => patchLighting({ mode: 'reshape' })}
          >
            重塑光线
          </button>
        </div>
        <button type="button" className="prompt-helper-secondary" onClick={addLight}>
          <Plus size={14} /> 新增灯光
        </button>
        <div className="prompt-helper-light-list">
          {config.lights.map((light, index) => (
            <div key={light.id} className="prompt-helper-light-card">
              <div className="prompt-helper-light-card__header">
                <input value={light.name} onChange={(event) => updateLight(index, { name: event.target.value })} />
                <button
                  type="button"
                  onClick={() =>
                    patchLighting({ lights: config.lights.filter((_, lightIndex) => lightIndex !== index) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="prompt-helper-light-card__grid">
                <label className="prompt-helper-field">
                  <span>类型</span>
                  <select value={light.type} onChange={(event) => updateLight(index, { type: event.target.value })}>
                    {Object.entries(LIGHT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="强度"
                  value={light.intensity}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(value) => updateLight(index, { intensity: value })}
                />
                <label className="prompt-helper-field">
                  <span>颜色</span>
                  <input
                    type="color"
                    value={light.color}
                    onChange={(event) => updateLight(index, { color: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="prompt-helper-secondary"
                  onClick={() => updateLight(index, { direction: directionToTarget(light.position) })}
                >
                  指向主体
                </button>
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <NumberField
                    key={axis}
                    label={`位置 ${axis.toUpperCase()}`}
                    value={light.position[axis]}
                    min={axis === 'y' ? 0 : -8}
                    max={8}
                    step={0.1}
                    onChange={(value) => updateLightPosition(index, { ...light.position, [axis]: value })}
                  />
                ))}
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <NumberField
                    key={`direction-${axis}`}
                    label={`方向 ${axis.toUpperCase()}`}
                    value={light.direction[axis]}
                    min={-1}
                    max={1}
                    step={0.1}
                    onChange={(value) => updateLight(index, { direction: { ...light.direction, [axis]: value } })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryboardTool({ data, onPatch }: { data: PromptHelperData; onPatch: (patch: PromptHelperPatch) => void }) {
  const config = data.storyboardConfig;
  const patchStoryboard = (patch: Partial<typeof config>) => onPatch({ storyboardConfig: { ...config, ...patch } });
  const setShotCount = (shotCount: number) => {
    const nextCount = Math.max(1, Math.min(12, Math.trunc(shotCount)));
    patchStoryboard({
      shotCount: nextCount,
      shots: Array.from(
        { length: nextCount },
        (_, index) =>
          config.shots[index] || {
            id: `shot-${index + 1}`,
            duration: '',
            content: '',
            note: '',
          },
      ),
    });
  };
  const updateShot = (index: number, patch: Partial<PromptHelperData['storyboardConfig']['shots'][number]>) => {
    patchStoryboard({
      shots: config.shots.map((shot, shotIndex) => (shotIndex === index ? { ...shot, ...patch } : shot)),
    });
  };
  const layoutSpec = getStoryboardLayoutPreset(config.layoutPreset);
  const isCustomLayout = config.layoutPreset === 'custom';
  const previewColumns =
    layoutSpec.columns || STORYBOARD_GRID_COLUMNS[config.layoutPreset] || Math.min(3, config.shotCount);
  const previewRatio = getStoryboardPreviewRatio(config.aspectRatio);
  const setLayoutPreset = (layoutPreset: string) => {
    const nextSpec = getStoryboardLayoutPreset(layoutPreset);
    if (layoutPreset === 'custom') {
      patchStoryboard({ layoutPreset });
      return;
    }
    const nextCount = nextSpec.shotCount || config.shotCount;
    patchStoryboard({
      layoutPreset,
      shotCount: nextCount,
      aspectRatio: nextSpec.aspectRatio || config.aspectRatio,
      shots: Array.from(
        { length: nextCount },
        (_, index) =>
          config.shots[index] || {
            id: `shot-${index + 1}`,
            duration: '',
            content: '',
            note: '',
          },
      ),
    });
  };

  return (
    <div className="prompt-helper-storyboard">
      <div className="prompt-helper-inline-controls">
        <label className="prompt-helper-field">
          <span>分镜图版式</span>
          <select value={config.layoutPreset} onChange={(event) => setLayoutPreset(event.target.value)}>
            {STORYBOARD_LAYOUT_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="镜头数"
          value={config.shotCount}
          min={1}
          max={12}
          disabled={!isCustomLayout}
          onChange={setShotCount}
        />
        <label className="prompt-helper-field">
          <span>整图画幅比例</span>
          <select
            value={config.aspectRatio}
            disabled={!isCustomLayout}
            onChange={(event) => patchStoryboard({ aspectRatio: event.target.value })}
          >
            {STORYBOARD_ASPECT_RATIOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="prompt-helper-field">
          <span>视觉风格</span>
          <select value={config.stylePreset} onChange={(event) => patchStoryboard({ stylePreset: event.target.value })}>
            {STORYBOARD_STYLE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="自定义风格"
          value={config.customStyle}
          onChange={(value) =>
            patchStoryboard({ customStyle: value, stylePreset: value.trim() ? 'custom' : config.stylePreset })
          }
        />
        <label className="prompt-helper-check">
          <input
            type="checkbox"
            checked={config.continuity}
            onChange={(event) => patchStoryboard({ continuity: event.target.checked })}
          />
          <span>保持连续性</span>
        </label>
        <label className="prompt-helper-check">
          <input
            type="checkbox"
            checked={config.noText}
            onChange={(event) => patchStoryboard({ noText: event.target.checked })}
          />
          <span>画面无文字</span>
        </label>
        <label className="prompt-helper-check">
          <input
            type="checkbox"
            checked={config.includeShotNumbers}
            onChange={(event) => patchStoryboard({ includeShotNumbers: event.target.checked })}
          />
          <span>允许镜头编号</span>
        </label>
      </div>
      <div
        className="prompt-helper-storyboard-sheet"
        style={
          {
            '--storyboard-columns': previewColumns,
            '--storyboard-ratio': previewRatio,
          } as CSSProperties
        }
      >
        <div className="prompt-helper-shot-grid">
          {config.shots.map((shot, index) => (
            <div key={shot.id} className="prompt-helper-shot-card">
              <div className="prompt-helper-shot-frame">
                <div className="prompt-helper-shot-frame__label">{circledNumber(index)}</div>
                <div className="prompt-helper-shot-fields">
                  <label className="prompt-helper-shot-field prompt-helper-shot-field--duration">
                    <span>时长</span>
                    <input
                      value={shot.duration}
                      onChange={(event) => updateShot(index, { duration: event.target.value })}
                      placeholder="可空"
                    />
                  </label>
                  <label className="prompt-helper-shot-field">
                    <span>内容</span>
                    <input
                      value={shot.content}
                      onChange={(event) => updateShot(index, { content: event.target.value })}
                      placeholder="可空，让 AI 自由发挥"
                    />
                  </label>
                  <label className="prompt-helper-shot-field">
                    <span>备注</span>
                    <input
                      value={shot.note}
                      onChange={(event) => updateShot(index, { note: event.target.value })}
                      placeholder="可空"
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutTool({ data, onPatch }: { data: PromptHelperData; onPatch: (patch: PromptHelperPatch) => void }) {
  const config = data.layoutConfig;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const patchLayout = (patch: Partial<typeof config>) => onPatch({ layoutConfig: { ...config, ...patch } });
  const currentTemplate =
    LAYOUT_TEMPLATE_PRESETS.find((item) => item.id === config.template) || LAYOUT_TEMPLATE_PRESETS[0];
  const applyTemplate = (templateId: string) => {
    const preset = LAYOUT_TEMPLATE_PRESETS.find((item) => item.id === templateId) || LAYOUT_TEMPLATE_PRESETS[0];
    patchLayout({
      template: preset.id,
      subjectKind: preset.subjectKind,
      blocks:
        preset.id === 'custom'
          ? config.blocks
          : preset.blocks.map((block) => ({
              ...block,
              description: block.description || '',
              priority: block.priority || 'secondary',
            })),
    });
  };
  const updateBlock = (index: number, patch: Record<string, unknown>) => {
    patchLayout({
      blocks: config.blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)),
    });
  };
  const addBlock = () => {
    const index = config.blocks.length + 1;
    patchLayout({
      blocks: [
        ...config.blocks,
        {
          id: `block-${Date.now()}`,
          kind: 'custom',
          label: `内容 ${index}`,
          description: '',
          priority: 'secondary',
          x: 8,
          y: 8,
          w: 22,
          h: 28,
        },
      ],
      template: 'custom',
    });
  };

  return (
    <div className="prompt-helper-layout">
      <div className="prompt-helper-layout__top">
        <label className="prompt-helper-field">
          <span>版式模板</span>
          <select value={config.template} onChange={(event) => applyTemplate(event.target.value)}>
            {LAYOUT_TEMPLATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="prompt-helper-field">
          <span>主体类型</span>
          <select
            value={config.subjectKind}
            onChange={(event) => patchLayout({ subjectKind: event.target.value as typeof config.subjectKind })}
          >
            {LAYOUT_SUBJECT_KIND_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="prompt-helper-secondary" onClick={() => applyTemplate(currentTemplate.id)}>
          重置模板
        </button>
      </div>
      <div className="prompt-helper-layout__canvas">
        {config.blocks.map((block) => (
          <div
            key={block.id}
            className="prompt-helper-layout__block"
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.w}%`,
              height: `${block.h}%`,
            }}
          >
            <span>{block.label}</span>
            <small>{LAYOUT_BLOCK_KIND_OPTIONS.find((item) => item.id === block.kind)?.label || '自定义'}</small>
          </div>
        ))}
      </div>
      <div className="prompt-helper-controls prompt-helper-controls--layout">
        <button type="button" className="prompt-helper-secondary" onClick={addBlock}>
          <Plus size={14} /> 新增内容块
        </button>
        <button type="button" className="prompt-helper-secondary" onClick={() => setAdvancedOpen((value) => !value)}>
          {advancedOpen ? '收起高级布局' : '高级布局'}
        </button>
        <label className="prompt-helper-check">
          <input
            type="checkbox"
            checked={config.consistency}
            onChange={(event) => patchLayout({ consistency: event.target.checked })}
          />
          <span>保持设计一致</span>
        </label>
        {config.blocks.map((block, index) => (
          <div key={block.id} className="prompt-helper-layout-card">
            <div className="prompt-helper-light-card__header">
              <input value={block.label} onChange={(event) => updateBlock(index, { label: event.target.value })} />
              <button
                type="button"
                onClick={() => patchLayout({ blocks: config.blocks.filter((_, blockIndex) => blockIndex !== index) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="prompt-helper-light-card__grid">
              <label className="prompt-helper-field">
                <span>块类型</span>
                <select value={block.kind} onChange={(event) => updateBlock(index, { kind: event.target.value })}>
                  {LAYOUT_BLOCK_KIND_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="prompt-helper-field">
                <span>权重</span>
                <select
                  value={block.priority}
                  onChange={(event) => updateBlock(index, { priority: event.target.value })}
                >
                  {LAYOUT_BLOCK_PRIORITY_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="prompt-helper-field prompt-helper-field--wide">
                <span>说明</span>
                <textarea
                  value={block.description}
                  onChange={(event) => updateBlock(index, { description: event.target.value })}
                  placeholder="例如：保留 Logo 和标签文字，展示瓶身材质细节"
                />
              </label>
              {advancedOpen && (
                <>
                  <NumberField
                    label="X %"
                    value={block.x}
                    min={0}
                    max={92}
                    onChange={(value) => updateBlock(index, { x: value })}
                  />
                  <NumberField
                    label="Y %"
                    value={block.y}
                    min={0}
                    max={92}
                    onChange={(value) => updateBlock(index, { y: value })}
                  />
                  <NumberField
                    label="宽 %"
                    value={block.w}
                    min={8}
                    max={100}
                    onChange={(value) => updateBlock(index, { w: value })}
                  />
                  <NumberField
                    label="高 %"
                    value={block.h}
                    min={8}
                    max={100}
                    onChange={(value) => updateBlock(index, { h: value })}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreeScene({
  cameraConfig,
  lights = [],
  interactionMode = 'camera',
  onCameraPositionChange,
  onLightPositionChange,
  onLightDirectionChange,
}: {
  cameraConfig: PromptHelperData['cameraConfig'];
  lights?: PromptHelperData['lightingConfig']['lights'];
  interactionMode?: 'camera' | 'lighting';
  onCameraPositionChange?: (position: PromptHelperPoint) => void;
  onLightPositionChange?: (lightId: string, position: PromptHelperPoint) => void;
  onLightDirectionChange?: (lightId: string, direction: PromptHelperPoint) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraConfigRef = useRef(cameraConfig);
  const lightsRef = useRef(lights);
  const callbacksRef = useRef({ onCameraPositionChange, onLightPositionChange, onLightDirectionChange });
  cameraConfigRef.current = cameraConfig;
  lightsRef.current = lights;
  callbacksRef.current = { onCameraPositionChange, onLightPositionChange, onLightDirectionChange };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const initialConfig = cameraConfigRef.current;
    const initialTarget = new THREE.Vector3(
      (initialConfig.position.x + initialConfig.target.x) / 2,
      Math.max(1.2, (initialConfig.position.y + initialConfig.target.y) / 2),
      (initialConfig.position.z + initialConfig.target.z) / 2,
    );
    const orbit = {
      yaw: Math.PI / 4,
      pitch: 0.52,
      distance: 14,
      target: initialTarget,
    };
    const updateOrbitCamera = () => {
      const pitch = Math.max(0.18, Math.min(1.24, orbit.pitch));
      const horizontal = Math.cos(pitch) * orbit.distance;
      camera.position.set(
        orbit.target.x + Math.sin(orbit.yaw) * horizontal,
        orbit.target.y + Math.sin(pitch) * orbit.distance,
        orbit.target.z + Math.cos(orbit.yaw) * horizontal,
      );
      camera.lookAt(orbit.target);
    };
    updateOrbitCamera();

    const grid = new THREE.GridHelper(12, 12, 0x4b5563, 0x374151);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(3));

    const subject = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 1.6, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.65 }),
    );
    subject.position.y = 1.1;
    scene.add(subject);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    type MoveAxis = 'x' | 'y' | 'z';
    type MoveTarget =
      | { type: 'camera' }
      | { type: 'cameraAxis'; axis: MoveAxis }
      | { type: 'light'; lightId: string }
      | { type: 'lightAxis'; lightId: string; axis: MoveAxis }
      | { type: 'lightDirection'; lightId: string };
    const axisVectors: Record<MoveAxis, THREE.Vector3> = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };
    const yAxis = new THREE.Vector3(0, 1, 0);
    const getDirectionQuaternion = (direction: PromptHelperPoint) => {
      const vector = new THREE.Vector3(direction.x, direction.y, direction.z);
      if (vector.lengthSq() < 0.0001) vector.set(0, -1, 0);
      return new THREE.Quaternion().setFromUnitVectors(yAxis, vector.normalize());
    };
    const directionToVector = (direction: PromptHelperPoint) => {
      const vector = new THREE.Vector3(direction.x, direction.y, direction.z);
      if (vector.lengthSq() < 0.0001) vector.set(0, -1, 0);
      return vector.normalize();
    };
    const createSpotConeGeometry = (radius: number, length: number) =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(radius, length, radius),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-radius, length, radius),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(radius, length, -radius),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-radius, length, -radius),
        new THREE.Vector3(radius, length, radius),
        new THREE.Vector3(-radius, length, radius),
        new THREE.Vector3(-radius, length, radius),
        new THREE.Vector3(-radius, length, -radius),
        new THREE.Vector3(-radius, length, -radius),
        new THREE.Vector3(radius, length, -radius),
        new THREE.Vector3(radius, length, -radius),
        new THREE.Vector3(radius, length, radius),
      ]);
    const orientAlongAxis = (object: THREE.Object3D, axis: MoveAxis) => {
      if (axis === 'x') object.rotation.z = -Math.PI / 2;
      if (axis === 'z') object.rotation.x = Math.PI / 2;
    };
    const setAxisTarget = (object: THREE.Object3D, target: MoveTarget) => {
      object.userData.moveTarget = target;
      object.children.forEach((child) => setAxisTarget(child, target));
    };
    const createAxisHandle = (axis: MoveAxis, length: number, color: number, target: MoveTarget) => {
      const axisGroup = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, length * 0.72, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      shaft.position.copy(axisVectors[axis].clone().multiplyScalar(length * 0.36));
      orientAlongAxis(shaft, axis);
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(length * 0.1, length * 0.22, 16),
        new THREE.MeshBasicMaterial({ color }),
      );
      head.position.copy(axisVectors[axis].clone().multiplyScalar(length * 0.82));
      orientAlongAxis(head, axis);
      const hitTarget = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, length, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitTarget.position.copy(axisVectors[axis].clone().multiplyScalar(length * 0.5));
      orientAlongAxis(hitTarget, axis);
      axisGroup.add(shaft, head, hitTarget);
      setAxisTarget(axisGroup, target);
      return axisGroup;
    };
    const createMoveAxes = (length: number, owner: { type: 'camera' } | { type: 'light'; lightId: string }) => {
      const axes = new THREE.Group();
      const targetType = owner.type === 'camera' ? 'cameraAxis' : 'lightAxis';
      const baseTarget = owner.type === 'camera' ? {} : { lightId: owner.lightId };
      const xAxis = createAxisHandle('x', length, 0xef4444, {
        ...baseTarget,
        type: targetType,
        axis: 'x',
      } as MoveTarget);
      const yAxis = createAxisHandle('y', length, 0x22c55e, {
        ...baseTarget,
        type: targetType,
        axis: 'y',
      } as MoveTarget);
      const zAxis = createAxisHandle('z', length, 0x3b82f6, {
        ...baseTarget,
        type: targetType,
        axis: 'z',
      } as MoveTarget);
      axes.add(xAxis, yAxis, zAxis);
      return axes;
    };

    const cameraRig = new THREE.Group();
    const cameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.42, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    );
    const cameraLens = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.48, 24),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true }),
    );
    cameraLens.rotation.x = -Math.PI / 2;
    cameraLens.position.z = 0.46;
    const cameraFrustum = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.48),
        new THREE.Vector3(-0.38, -0.24, 1.28),
        new THREE.Vector3(0, 0, 0.48),
        new THREE.Vector3(0.38, -0.24, 1.28),
        new THREE.Vector3(0, 0, 0.48),
        new THREE.Vector3(-0.38, 0.24, 1.28),
        new THREE.Vector3(0, 0, 0.48),
        new THREE.Vector3(0.38, 0.24, 1.28),
        new THREE.Vector3(-0.38, -0.24, 1.28),
        new THREE.Vector3(0.38, -0.24, 1.28),
        new THREE.Vector3(0.38, -0.24, 1.28),
        new THREE.Vector3(0.38, 0.24, 1.28),
        new THREE.Vector3(0.38, 0.24, 1.28),
        new THREE.Vector3(-0.38, 0.24, 1.28),
        new THREE.Vector3(-0.38, 0.24, 1.28),
        new THREE.Vector3(-0.38, -0.24, 1.28),
      ]),
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8 }),
    );
    const cameraGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    const cameraStem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -2, 0)]),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 }),
    );
    const cameraAxes = createMoveAxes(1.35, { type: 'camera' });
    cameraRig.add(cameraGlow, cameraBody, cameraLens, cameraFrustum, cameraStem, cameraAxes);
    scene.add(cameraRig);
    const cameraAimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 }),
    );
    scene.add(cameraAimLine);

    const lightGroup = new THREE.Group();
    scene.add(lightGroup);
    const lightMarkers = new Map<string, THREE.Object3D>();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.18;
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const cameraHitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    cameraHitTarget.userData.dragTarget = 'camera';
    cameraRig.add(cameraHitTarget);
    const cameraDragMeshes = [cameraBody, cameraLens, cameraHitTarget];
    type DragState =
      | { type: 'orbit'; pointerId: number; x: number; y: number }
      | {
          type: 'camera';
          pointerId: number;
          planeY: number;
          startClientY: number;
          startPosition: THREE.Vector3;
          offset: THREE.Vector3;
        }
      | {
          type: 'light';
          pointerId: number;
          lightId: string;
          planeY: number;
          startClientY: number;
          startPosition: THREE.Vector3;
          offset: THREE.Vector3;
        }
      | {
          type: 'cameraAxis';
          pointerId: number;
          axis: MoveAxis;
          startX: number;
          startY: number;
          startPosition: THREE.Vector3;
          pixelsPerUnit: number;
          screenAxis: THREE.Vector2;
          worldAxis: THREE.Vector3;
        }
      | {
          type: 'lightAxis';
          pointerId: number;
          lightId: string;
          axis: MoveAxis;
          startX: number;
          startY: number;
          startPosition: THREE.Vector3;
          pixelsPerUnit: number;
          screenAxis: THREE.Vector2;
          worldAxis: THREE.Vector3;
        }
      | {
          type: 'lightDirection';
          pointerId: number;
          lightId: string;
          position: THREE.Vector3;
          startClientY: number;
          startDirection: THREE.Vector3;
        }
      | null;
    let dragState: DragState = null;
    let hoveredTarget: MoveTarget | null = null;

    const setPointerFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getGroundPoint = (event: PointerEvent, y: number) => {
      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      dragPlane.constant = -y;
      return raycaster.ray.intersectPlane(dragPlane, dragPoint) ? dragPoint.clone() : null;
    };

    const getHitTarget = (event: PointerEvent) => {
      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      const axisHit = raycaster
        .intersectObjects([cameraAxes, ...Array.from(lightMarkers.values())], true)
        .find((hit) => hit.object.userData.moveTarget);
      if (axisHit?.object.userData.moveTarget) return axisHit.object.userData.moveTarget as MoveTarget;
      const cameraHit = raycaster.intersectObjects(cameraDragMeshes, false)[0];
      if (cameraHit) return { type: 'camera' as const };
      const lightObjects = Array.from(lightMarkers.values());
      const lightHit = raycaster.intersectObjects(lightObjects, true)[0];
      let lightObject: THREE.Object3D | null | undefined = lightHit?.object;
      while (lightObject && !lightObject.userData.lightId && !lightObject.userData.moveTarget)
        lightObject = lightObject.parent;
      if (lightObject?.userData.moveTarget) return lightObject.userData.moveTarget as MoveTarget;
      while (lightObject && !lightObject.userData.lightId) lightObject = lightObject.parent;
      if (lightObject?.userData.lightId) {
        return { type: 'light' as const, lightId: String(lightObject.userData.lightId) };
      }
      return null;
    };

    const toScreenPoint = (worldPoint: THREE.Vector3) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const projected = worldPoint.clone().project(camera);
      return new THREE.Vector2(
        (projected.x * 0.5 + 0.5) * rect.width + rect.left,
        (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
      );
    };

    const getTargetWorldAxis = (target: Extract<MoveTarget, { type: 'cameraAxis' | 'lightAxis' }>) => {
      const quaternion = new THREE.Quaternion();
      if (target.type === 'cameraAxis') {
        cameraRig.getWorldQuaternion(quaternion);
      } else {
        lightMarkers.get(target.lightId)?.getWorldQuaternion(quaternion);
      }
      return axisVectors[target.axis].clone().applyQuaternion(quaternion).normalize();
    };

    const createAxisDragState = (
      target: Extract<MoveTarget, { type: 'cameraAxis' | 'lightAxis' }>,
      pointerId: number,
      clientX: number,
      clientY: number,
      startPosition: THREE.Vector3,
    ): Extract<DragState, { type: 'cameraAxis' | 'lightAxis' }> => {
      const axisVector = getTargetWorldAxis(target);
      const originScreen = toScreenPoint(startPosition);
      const axisScreen = toScreenPoint(startPosition.clone().add(axisVector));
      const screenDelta = axisScreen.sub(originScreen);
      const pixelsPerUnit = Math.max(1, screenDelta.length());
      const screenAxis = screenDelta.normalize();
      return target.type === 'cameraAxis'
        ? {
            type: 'cameraAxis',
            pointerId,
            axis: target.axis,
            startX: clientX,
            startY: clientY,
            startPosition,
            pixelsPerUnit,
            screenAxis,
            worldAxis: axisVector,
          }
        : {
            type: 'lightAxis',
            pointerId,
            lightId: target.lightId,
            axis: target.axis,
            startX: clientX,
            startY: clientY,
            startPosition,
            pixelsPerUnit,
            screenAxis,
            worldAxis: axisVector,
          };
    };

    const clampPoint = (point: THREE.Vector3) => ({
      x: Math.max(-8, Math.min(8, Number(point.x.toFixed(1)))),
      y: Math.max(0, Math.min(8, Number(point.y.toFixed(1)))),
      z: Math.max(-8, Math.min(8, Number(point.z.toFixed(1)))),
    });

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      renderer.domElement.focus();
      const target = getHitTarget(event);
      if (target?.type === 'cameraAxis' && interactionMode === 'camera') {
        const config = cameraConfigRef.current;
        dragState = createAxisDragState(
          target,
          event.pointerId,
          event.clientX,
          event.clientY,
          new THREE.Vector3(config.position.x, config.position.y, config.position.z),
        );
      } else if (target?.type === 'lightAxis' && interactionMode === 'lighting') {
        const light = lightsRef.current.find((item) => item.id === target.lightId);
        if (!light) return;
        dragState = createAxisDragState(
          target,
          event.pointerId,
          event.clientX,
          event.clientY,
          new THREE.Vector3(light.position.x, light.position.y, light.position.z),
        );
      } else if (target?.type === 'camera' && interactionMode === 'camera') {
        const config = cameraConfigRef.current;
        const origin = new THREE.Vector3(config.position.x, config.position.y, config.position.z);
        const planePoint = getGroundPoint(event, origin.y);
        dragState = {
          type: 'camera',
          pointerId: event.pointerId,
          planeY: origin.y,
          startClientY: event.clientY,
          startPosition: origin.clone(),
          offset: planePoint ? origin.clone().sub(planePoint) : new THREE.Vector3(),
        };
      } else if (target?.type === 'light' && interactionMode === 'lighting') {
        const light = lightsRef.current.find((item) => item.id === target.lightId);
        if (!light) return;
        const origin = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
        const planePoint = getGroundPoint(event, origin.y);
        dragState = {
          type: 'light',
          pointerId: event.pointerId,
          lightId: target.lightId,
          planeY: origin.y,
          startClientY: event.clientY,
          startPosition: origin.clone(),
          offset: planePoint ? origin.clone().sub(planePoint) : new THREE.Vector3(),
        };
      } else if (target?.type === 'lightDirection' && interactionMode === 'lighting') {
        const light = lightsRef.current.find((item) => item.id === target.lightId);
        if (!light) return;
        dragState = {
          type: 'lightDirection',
          pointerId: event.pointerId,
          lightId: target.lightId,
          position: new THREE.Vector3(light.position.x, light.position.y, light.position.z),
          startClientY: event.clientY,
          startDirection: directionToVector(light.direction),
        };
      } else {
        dragState = { type: 'orbit', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      }
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = getHitTarget(event);
      hoveredTarget = target;
      renderer.domElement.style.cursor =
        dragState && dragState.type !== 'orbit' ? 'grabbing' : target ? 'grab' : dragState ? 'grabbing' : 'move';
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (dragState.type === 'orbit') {
        const dx = event.clientX - dragState.x;
        const dy = event.clientY - dragState.y;
        orbit.yaw -= dx * 0.008;
        orbit.pitch = Math.max(0.18, Math.min(1.24, orbit.pitch + dy * 0.006));
        dragState.x = event.clientX;
        dragState.y = event.clientY;
        updateOrbitCamera();
        event.preventDefault();
        return;
      }

      if (dragState.type === 'cameraAxis' || dragState.type === 'lightAxis') {
        const pointerDelta = new THREE.Vector2(event.clientX - dragState.startX, event.clientY - dragState.startY);
        const amount = pointerDelta.dot(dragState.screenAxis) / dragState.pixelsPerUnit;
        const nextPoint = dragState.startPosition.clone().add(dragState.worldAxis.clone().multiplyScalar(amount));
        const next = clampPoint(nextPoint);
        if (dragState.type === 'cameraAxis') callbacksRef.current.onCameraPositionChange?.(next);
        else callbacksRef.current.onLightPositionChange?.(dragState.lightId, next);
        event.preventDefault();
        return;
      }

      if (dragState.type === 'lightDirection') {
        if (event.shiftKey) {
          const dy = dragState.startClientY - event.clientY;
          const direction = new THREE.Vector3(
            dragState.startDirection.x,
            dragState.startDirection.y + dy * 0.01,
            dragState.startDirection.z,
          );
          if (direction.lengthSq() < 0.01) return;
          const normalized = direction.normalize();
          callbacksRef.current.onLightDirectionChange?.(dragState.lightId, {
            x: Number(normalized.x.toFixed(2)),
            y: Number(normalized.y.toFixed(2)),
            z: Number(normalized.z.toFixed(2)),
          });
          event.preventDefault();
          return;
        }
        const planePoint = getGroundPoint(event, dragState.position.y);
        if (!planePoint) return;
        const direction = planePoint.sub(dragState.position);
        if (direction.lengthSq() < 0.01) return;
        const normalized = direction.normalize();
        callbacksRef.current.onLightDirectionChange?.(dragState.lightId, {
          x: Number(normalized.x.toFixed(2)),
          y: Number(normalized.y.toFixed(2)),
          z: Number(normalized.z.toFixed(2)),
        });
        event.preventDefault();
        return;
      }

      if (event.shiftKey) {
        const dy = dragState.startClientY - event.clientY;
        const next = clampPoint(
          new THREE.Vector3(
            dragState.startPosition.x,
            dragState.startPosition.y + dy * 0.025,
            dragState.startPosition.z,
          ),
        );
        if (dragState.type === 'camera') callbacksRef.current.onCameraPositionChange?.(next);
        else callbacksRef.current.onLightPositionChange?.(dragState.lightId, next);
        event.preventDefault();
        return;
      }

      const planePoint = getGroundPoint(event, dragState.planeY);
      if (!planePoint) return;
      const nextPoint = planePoint.add(dragState.offset);
      const next = clampPoint(nextPoint);
      if (dragState.type === 'camera') callbacksRef.current.onCameraPositionChange?.(next);
      else callbacksRef.current.onLightPositionChange?.(dragState.lightId, next);
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragState?.pointerId === event.pointerId) {
        dragState = null;
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      orbit.distance = Math.max(5, Math.min(22, orbit.distance + event.deltaY * 0.01));
      updateOrbitCamera();
      event.preventDefault();
    };

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const syncLights = () => {
      lightGroup.clear();
      lightMarkers.clear();
      lightsRef.current.forEach((light) => {
        const color = new THREE.Color(light.color || '#ffffff');
        const direction = directionToVector(light.direction);
        const markerGroup = new THREE.Group();
        markerGroup.userData.lightId = light.id;
        markerGroup.position.set(light.position.x, light.position.y, light.position.z);
        markerGroup.quaternion.copy(getDirectionQuaternion(light.direction));
        const isActive =
          (dragState && dragState.type === 'light' && dragState.lightId === light.id) ||
          (hoveredTarget?.type === 'light' && hoveredTarget.lightId === light.id) ||
          (dragState && dragState.type === 'lightDirection' && dragState.lightId === light.id) ||
          (hoveredTarget?.type === 'lightDirection' && hoveredTarget.lightId === light.id);
        const marker = new THREE.Mesh(
          light.type === 'spot' ? new THREE.ConeGeometry(0.22, 0.46, 16) : new THREE.SphereGeometry(0.22, 16, 16),
          new THREE.MeshBasicMaterial({ color }),
        );
        const hitTarget = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 16, 16),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        hitTarget.userData.lightId = light.id;
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 16, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isActive ? 0.28 : 0.12 }),
        );
        const lightAxes = createMoveAxes(0.92, { type: 'light', lightId: light.id });
        markerGroup.scale.setScalar(isActive ? 1.25 : 1);
        markerGroup.add(glow, marker, hitTarget, lightAxes);
        lightMarkers.set(light.id, markerGroup);
        lightGroup.add(markerGroup);

        const directionGroup = new THREE.Group();
        directionGroup.position.copy(markerGroup.position);
        directionGroup.quaternion.copy(getDirectionQuaternion(light.direction));
        directionGroup.scale.setScalar(isActive ? 1.12 : 1);
        const directionLength = light.type === 'directional' ? 2.3 : light.type === 'spot' ? 2 : 1.55;
        const directionArrow = new THREE.ArrowHelper(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(),
          directionLength,
          color,
          0.28,
          0.16,
        );
        const directionHandle = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 16, 16),
          new THREE.MeshBasicMaterial({ color }),
        );
        directionHandle.position.y = directionLength;
        directionHandle.userData.moveTarget = { type: 'lightDirection', lightId: light.id };
        const directionHitTarget = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, directionLength, 12),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        directionHitTarget.position.y = directionLength / 2;
        directionHitTarget.userData.moveTarget = { type: 'lightDirection', lightId: light.id };
        directionGroup.userData.moveTarget = { type: 'lightDirection', lightId: light.id };
        directionGroup.add(directionArrow, directionHandle, directionHitTarget);
        if (light.type === 'spot') {
          const spotCone = new THREE.LineSegments(
            createSpotConeGeometry(0.7, 1.35),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.48 }),
          );
          directionGroup.add(spotCone);
        }
        lightGroup.add(directionGroup);

        if (light.type === 'directional') {
          const source = new THREE.DirectionalLight(color, light.intensity);
          source.position.copy(markerGroup.position);
          source.target.position.copy(markerGroup.position.clone().add(direction));
          lightGroup.add(source);
          lightGroup.add(source.target);
        } else if (light.type === 'spot') {
          const source = new THREE.SpotLight(color, light.intensity, 12, Math.PI / 6);
          source.position.copy(markerGroup.position);
          source.target.position.copy(markerGroup.position.clone().add(direction));
          lightGroup.add(source, source.target);
        } else {
          const source = new THREE.PointLight(color, light.intensity, 12);
          source.position.copy(markerGroup.position);
          lightGroup.add(source);
        }
      });
    };

    let frame = 0;
    const animate = () => {
      const config = cameraConfigRef.current;
      cameraRig.position.set(config.position.x, config.position.y, config.position.z);
      cameraRig.lookAt(config.target.x, config.target.y, config.target.z);
      const cameraActive =
        (dragState && (dragState.type === 'camera' || dragState.type === 'cameraAxis')) ||
        hoveredTarget?.type === 'camera' ||
        hoveredTarget?.type === 'cameraAxis';
      (cameraGlow.material as THREE.MeshBasicMaterial).opacity = cameraActive ? 0.28 : 0.14;
      cameraBody.scale.setScalar(cameraActive ? 1.18 : 1);
      cameraLens.scale.setScalar(cameraActive ? 1.18 : 1);
      cameraAimLine.geometry.setFromPoints([
        new THREE.Vector3(config.position.x, config.position.y, config.position.z),
        new THREE.Vector3(config.target.x, config.target.y, config.target.z),
      ]);
      syncLights();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [interactionMode]);

  return (
    <div ref={mountRef} className="prompt-helper-three">
      <div className="prompt-helper-three__hint">
        拖动画布旋转，滚轮缩放；拖动{interactionMode === 'lighting' ? '灯光' : '相机'}改位置，Shift 拖动改高度
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="prompt-helper-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="prompt-helper-field prompt-helper-field--wide">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function getPromptHelperPreview(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  return String(outputs?.prompt || buildPromptHelperPrompt(normalizePromptHelperData(data)));
}

export function getPromptHelperSummary(data: Record<string, unknown>) {
  return summarizePromptHelper(data);
}

export type { PromptHelperData };
