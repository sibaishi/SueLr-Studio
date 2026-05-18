export const PROMPT_HELPER_TOOLS = {
  camera: 'camera',
  lighting: 'lighting',
  storyboard: 'storyboard',
  layout: 'layout',
};

const TOOL_LABELS = {
  camera: '转换视角',
  lighting: '调整光照',
  storyboard: '生成分镜图',
  layout: '生成三视图',
};

const DEFAULT_CAMERA_CONFIG = {
  focalLength: 35,
  distance: 6,
  angle: 20,
  height: 1.6,
  position: { x: 3, y: 2, z: 6 },
  target: { x: 0, y: 1, z: 0 },
  shotSize: '中景',
  preserveSubject: true,
};

const DEFAULT_LIGHTING_CONFIG = {
  mode: 'add',
  lights: [
    {
      id: 'key',
      type: 'area',
      name: '主光',
      intensity: 1.2,
      color: '#ffffff',
      position: { x: -3, y: 4, z: 3 },
      direction: { x: 0.64, y: -0.64, z: -0.43 },
    },
  ],
};

const DEFAULT_STORYBOARD_CONFIG = {
  shotCount: 4,
  shots: [
    { id: 'shot-1', shotSize: '远景', camera: '建立场景', action: '展示环境与主体关系', transition: 'cut' },
    { id: 'shot-2', shotSize: '中景', camera: '平视跟随', action: '主体开始行动', transition: 'cut' },
    { id: 'shot-3', shotSize: '近景', camera: '轻微推进', action: '突出关键动作或表情', transition: 'cut' },
    { id: 'shot-4', shotSize: '特写', camera: '稳定镜头', action: '呈现结果与情绪落点', transition: 'cut' },
  ],
};

const DEFAULT_LAYOUT_CONFIG = {
  blocks: [
    { id: 'front', kind: 'front', label: '正面三视图', x: 8, y: 12, w: 24, h: 60 },
    { id: 'side', kind: 'side', label: '侧面三视图', x: 38, y: 12, w: 24, h: 60 },
    { id: 'back', kind: 'back', label: '背面三视图', x: 68, y: 12, w: 24, h: 60 },
  ],
  consistency: true,
};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizePoint(value, fallback) {
  const point = asObject(value);
  return {
    x: asNumber(point.x, fallback.x),
    y: asNumber(point.y, fallback.y),
    z: asNumber(point.z, fallback.z),
  };
}

function directionFromTo(position, target) {
  const vector = {
    x: target.x - position.x,
    y: target.y - position.y,
    z: target.z - position.z,
  };
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: Number((vector.x / length).toFixed(2)),
    y: Number((vector.y / length).toFixed(2)),
    z: Number((vector.z / length).toFixed(2)),
  };
}

function isLegacyUpDirection(direction) {
  return Math.abs(direction.x) < 0.001 && Math.abs(direction.y - 1) < 0.001 && Math.abs(direction.z) < 0.001;
}

export function getPromptHelperToolLabel(tool) {
  return TOOL_LABELS[tool] || TOOL_LABELS.camera;
}

export function normalizePromptHelperData(data = {}) {
  const source = asObject(data);
  const activeTool = Object.values(PROMPT_HELPER_TOOLS).includes(source.activeTool) ? source.activeTool : PROMPT_HELPER_TOOLS.camera;
  const cameraSource = asObject(source.cameraConfig);
  const lightingSource = asObject(source.lightingConfig);
  const storyboardSource = asObject(source.storyboardConfig);
  const layoutSource = asObject(source.layoutConfig);

  const cameraConfig = {
    focalLength: asNumber(cameraSource.focalLength, DEFAULT_CAMERA_CONFIG.focalLength),
    distance: asNumber(cameraSource.distance, DEFAULT_CAMERA_CONFIG.distance),
    angle: asNumber(cameraSource.angle, DEFAULT_CAMERA_CONFIG.angle),
    height: asNumber(cameraSource.height, DEFAULT_CAMERA_CONFIG.height),
    position: normalizePoint(cameraSource.position, DEFAULT_CAMERA_CONFIG.position),
    target: normalizePoint(cameraSource.target, DEFAULT_CAMERA_CONFIG.target),
    shotSize: asText(cameraSource.shotSize, DEFAULT_CAMERA_CONFIG.shotSize),
    preserveSubject: cameraSource.preserveSubject !== false,
  };

  const rawLights = Array.isArray(lightingSource.lights) ? lightingSource.lights : DEFAULT_LIGHTING_CONFIG.lights;
  const lightingConfig = {
    mode: lightingSource.mode === 'reshape' ? 'reshape' : 'add',
    lights: rawLights.slice(0, 6).map((light, index) => {
      const item = asObject(light);
      const position = normalizePoint(item.position, { x: index - 1, y: 3, z: 3 });
      const direction = normalizePoint(item.direction, { x: 0, y: 1, z: 0 });
      return {
        id: asText(item.id, `light-${index + 1}`),
        type: ['area', 'directional', 'spot'].includes(item.type) ? item.type : 'area',
        name: asText(item.name, `灯光 ${index + 1}`),
        intensity: asNumber(item.intensity, 1),
        color: asText(item.color, '#ffffff'),
        position,
        direction: isLegacyUpDirection(direction) ? directionFromTo(position, cameraConfig.target) : direction,
      };
    }),
  };

  const shotCount = Math.max(1, Math.min(12, Math.trunc(asNumber(storyboardSource.shotCount, DEFAULT_STORYBOARD_CONFIG.shotCount))));
  const rawShots = Array.isArray(storyboardSource.shots) ? storyboardSource.shots : DEFAULT_STORYBOARD_CONFIG.shots;
  const storyboardConfig = {
    shotCount,
    shots: Array.from({ length: shotCount }, (_, index) => {
      const item = asObject(rawShots[index]);
      const fallback = DEFAULT_STORYBOARD_CONFIG.shots[index % DEFAULT_STORYBOARD_CONFIG.shots.length];
      return {
        id: asText(item.id, `shot-${index + 1}`),
        shotSize: asText(item.shotSize, fallback.shotSize),
        camera: asText(item.camera, fallback.camera),
        action: asText(item.action, fallback.action),
        transition: asText(item.transition, fallback.transition),
      };
    }),
  };

  const rawBlocks = Array.isArray(layoutSource.blocks) ? layoutSource.blocks : DEFAULT_LAYOUT_CONFIG.blocks;
  const layoutConfig = {
    consistency: layoutSource.consistency !== false,
    blocks: rawBlocks.slice(0, 12).map((block, index) => {
      const item = asObject(block);
      const fallback = DEFAULT_LAYOUT_CONFIG.blocks[index % DEFAULT_LAYOUT_CONFIG.blocks.length];
      return {
        id: asText(item.id, `block-${index + 1}`),
        kind: asText(item.kind, fallback.kind),
        label: asText(item.label, fallback.label),
        x: Math.max(0, Math.min(100, asNumber(item.x, fallback.x))),
        y: Math.max(0, Math.min(100, asNumber(item.y, fallback.y))),
        w: Math.max(8, Math.min(100, asNumber(item.w, fallback.w))),
        h: Math.max(8, Math.min(100, asNumber(item.h, fallback.h))),
      };
    }),
  };

  return {
    activeTool,
    baseText: String(source.baseText ?? ''),
    cameraConfig,
    lightingConfig,
    storyboardConfig,
    layoutConfig,
  };
}

function formatPoint(point) {
  return `x ${point.x.toFixed(1)}, y ${point.y.toFixed(1)}, z ${point.z.toFixed(1)}`;
}

function buildCameraPrompt(config) {
  return [
    '辅助类型：转换视角 / camera view transformation.',
    `将画面转换为${config.shotSize}，摄像机位置为 ${formatPoint(config.position)}，朝向主体目标点 ${formatPoint(config.target)}。`,
    `镜头焦距感约 ${config.focalLength}mm，机位距离约 ${config.distance}m，高度约 ${config.height}m，水平角度约 ${config.angle}°。`,
    config.preserveSubject ? '保持主体身份、服装、材质、比例和关键特征一致，只改变观看视角与镜头语言。' : '允许根据新视角重构主体可见轮廓。',
    'English keywords: consistent subject, camera angle, focal length, perspective, composition, stable identity.',
  ];
}

function buildLightingPrompt(config) {
  const modeText = config.mode === 'reshape' ? '重塑光线，替换原有主要光照关系' : '增加光线，在原有光照基础上叠加新的灯光';
  const lightLines = config.lights.length > 0
    ? config.lights.map((light, index) => (
      `${index + 1}. ${light.name}: ${light.type} light, intensity ${light.intensity.toFixed(1)}, color ${light.color}, position ${formatPoint(light.position)}, direction ${formatPoint(light.direction)}.`
    ))
    : ['无新增灯光对象，保持柔和自然光。'];
  return [
    '辅助类型：调整光照 / lighting design.',
    `光照模式：${modeText}。`,
    '灯光配置：',
    ...lightLines,
    '强调合理阴影、体积感、明暗层次和材质反射，不改变主体结构。',
    'English keywords: cinematic lighting, realistic shadows, light direction, soft falloff, material response.',
  ];
}

function buildStoryboardPrompt(config) {
  return [
    '辅助类型：生成分镜图 / storyboard sheet.',
    `生成 ${config.shotCount} 格分镜图，使用清晰网格排列，每格呈现一个镜头画面。`,
    ...config.shots.map((shot, index) => (
      `镜头 ${index + 1}: ${shot.shotSize}，${shot.camera}，画面内容：${shot.action}，转场/节奏：${shot.transition}。`
    )),
    '保持画面连续性、角色一致性、动作方向清晰，适合后续生成影视分镜参考。',
    'English keywords: storyboard panels, sequential shots, cinematic framing, continuity, clear action.',
  ];
}

function buildLayoutPrompt(config) {
  return [
    '辅助类型：生成三视图 / character or object reference sheet.',
    '固定版面要求：纯白背景，无文字内容，无标注，无水印。',
    '按以下内容块拼成参考图版面：',
    ...config.blocks.map((block, index) => (
      `${index + 1}. ${block.label}，位置 ${block.x.toFixed(0)}%/${block.y.toFixed(0)}%，尺寸 ${block.w.toFixed(0)}% x ${block.h.toFixed(0)}%。`
    )),
    config.consistency ? '所有内容块保持同一角色/物体的比例、服装、材质、颜色和设计细节一致。' : '允许每个内容块根据用途略微调整表现。',
    'English keywords: pure white background, no text, reference sheet, front view, side view, back view, consistent design.',
  ];
}

export function buildPromptHelperPrompt(data = {}, inputs = {}) {
  const normalized = normalizePromptHelperData(data);
  const upstreamText = String(inputs.text ?? '').trim();
  const localText = String(normalized.baseText ?? '').trim();
  const baseText = upstreamText || localText;
  const lines = [];

  if (baseText) {
    lines.push('基础提示词 / base prompt:');
    lines.push(baseText);
    lines.push('');
  }

  if (normalized.activeTool === PROMPT_HELPER_TOOLS.lighting) {
    lines.push(...buildLightingPrompt(normalized.lightingConfig));
  } else if (normalized.activeTool === PROMPT_HELPER_TOOLS.storyboard) {
    lines.push(...buildStoryboardPrompt(normalized.storyboardConfig));
  } else if (normalized.activeTool === PROMPT_HELPER_TOOLS.layout) {
    lines.push(...buildLayoutPrompt(normalized.layoutConfig));
  } else {
    lines.push(...buildCameraPrompt(normalized.cameraConfig));
  }

  return lines.join('\n').trim();
}

export function summarizePromptHelper(data = {}) {
  const normalized = normalizePromptHelperData(data);
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.lighting) {
    return `${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.lightingConfig.mode === 'reshape' ? '重塑光线' : '增加光线'} · ${normalized.lightingConfig.lights.length} 盏灯`;
  }
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.storyboard) {
    return `${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.storyboardConfig.shotCount} 镜头`;
  }
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.layout) {
    return `${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.layoutConfig.blocks.length} 个版面块`;
  }
  return `${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.cameraConfig.focalLength}mm · ${normalized.cameraConfig.shotSize}`;
}
