export const PROMPT_HELPER_TOOLS = {
  camera: 'camera',
  lighting: 'lighting',
  storyboard: 'storyboard',
  layout: 'layout',
};

export const PROMPT_HELPER_MODEL_STYLES = {
  generic: 'generic',
  gptImage2: 'gpt-image-2',
  nanoBanana: 'nano-banana',
};

export const PROMPT_HELPER_CAMERA_MODES = {
  edit: 'edit',
  generate: 'generate',
};

export const PROMPT_HELPER_CAMERA_EDIT_STRATEGIES = {
  subjectRotate: 'subject-rotate',
  cameraRotate: 'camera-rotate',
};

export const STORYBOARD_LAYOUT_PRESETS = [
  { id: 'grid-4', label: '4格横版', description: '2 x 2 白底统一网格', shotCount: 4, aspectRatio: '16:9', columns: 2 },
  { id: 'grid-6', label: '6格横版', description: '3 x 2 白底统一网格', shotCount: 6, aspectRatio: '16:9', columns: 3 },
  {
    id: 'grid-9',
    label: '9格横版',
    description: '3 x 3 横向白底统一网格',
    shotCount: 9,
    aspectRatio: '16:9',
    columns: 3,
  },
  {
    id: 'vertical-3',
    label: '3格竖版',
    description: '单列竖向白底分镜',
    shotCount: 3,
    aspectRatio: '9:16',
    columns: 1,
  },
  {
    id: 'vertical-6',
    label: '6格竖版',
    description: '双列竖向白底分镜',
    shotCount: 6,
    aspectRatio: '9:16',
    columns: 2,
  },
  {
    id: 'vertical-9',
    label: '9格竖版',
    description: '3 x 3 竖向白底统一网格',
    shotCount: 9,
    aspectRatio: '9:16',
    columns: 3,
  },
  {
    id: 'custom',
    label: '自定义',
    description: '自定义镜头数与整张分镜图画幅比例',
    shotCount: null,
    aspectRatio: null,
    columns: null,
  },
];

export const STORYBOARD_STYLE_PRESETS = [
  { id: 'cinematic-realistic', label: '电影感写实' },
  { id: 'clean-commercial', label: '清爽商业广告' },
  { id: 'anime', label: '动画插画' },
  { id: 'sketch', label: '手绘草图' },
  { id: 'product-demo', label: '产品演示' },
  { id: 'social-video', label: '社媒短视频' },
  { id: 'ecommerce-detail', label: '电商详情页' },
  { id: 'custom', label: '自定义' },
];

export const LAYOUT_TEMPLATE_PRESETS = [
  {
    id: 'three-view',
    label: '标准三视图',
    subjectKind: 'character',
    blocks: [
      {
        id: 'front',
        kind: 'front',
        label: '正面视图',
        description: '主体正面，完整轮廓',
        priority: 'primary',
        x: 8,
        y: 12,
        w: 24,
        h: 60,
      },
      {
        id: 'side',
        kind: 'side',
        label: '侧面视图',
        description: '主体侧面，比例一致',
        priority: 'primary',
        x: 38,
        y: 12,
        w: 24,
        h: 60,
      },
      {
        id: 'back',
        kind: 'back',
        label: '背面视图',
        description: '主体背面，设计细节一致',
        priority: 'primary',
        x: 68,
        y: 12,
        w: 24,
        h: 60,
      },
    ],
  },
  {
    id: 'three-view-detail',
    label: '三视图 + 细节',
    subjectKind: 'character',
    blocks: [
      {
        id: 'front',
        kind: 'front',
        label: '正面视图',
        description: '主体正面，完整轮廓',
        priority: 'primary',
        x: 5,
        y: 10,
        w: 22,
        h: 58,
      },
      {
        id: 'side',
        kind: 'side',
        label: '侧面视图',
        description: '主体侧面，比例一致',
        priority: 'primary',
        x: 29,
        y: 10,
        w: 22,
        h: 58,
      },
      {
        id: 'back',
        kind: 'back',
        label: '背面视图',
        description: '主体背面，设计细节一致',
        priority: 'primary',
        x: 53,
        y: 10,
        w: 22,
        h: 58,
      },
      {
        id: 'detail',
        kind: 'detail',
        label: '细节特写',
        description: '关键服装、道具或材质细节',
        priority: 'secondary',
        x: 78,
        y: 18,
        w: 17,
        h: 32,
      },
    ],
  },
  {
    id: 'character-reference',
    label: '角色参考图',
    subjectKind: 'character',
    blocks: [
      {
        id: 'full-body',
        kind: 'front',
        label: '全身主视图',
        description: '完整角色比例和服装',
        priority: 'primary',
        x: 6,
        y: 10,
        w: 28,
        h: 66,
      },
      {
        id: 'pose',
        kind: 'pose',
        label: '姿态参考',
        description: '同一角色的自然姿态',
        priority: 'secondary',
        x: 39,
        y: 12,
        w: 24,
        h: 38,
      },
      {
        id: 'detail',
        kind: 'detail',
        label: '服装细节',
        description: '配饰、纹理和关键设计点',
        priority: 'secondary',
        x: 68,
        y: 12,
        w: 24,
        h: 28,
      },
      {
        id: 'material',
        kind: 'material',
        label: '材质样张',
        description: '服装和道具材质近景',
        priority: 'reference',
        x: 68,
        y: 48,
        w: 24,
        h: 24,
      },
    ],
  },
  {
    id: 'product-reference',
    label: '产品参考图',
    subjectKind: 'product',
    blocks: [
      {
        id: 'hero',
        kind: 'front',
        label: '产品主视图',
        description: '产品正面和整体轮廓',
        priority: 'primary',
        x: 7,
        y: 15,
        w: 32,
        h: 50,
      },
      {
        id: 'side',
        kind: 'side',
        label: '产品侧面',
        description: '侧面结构和厚度比例',
        priority: 'secondary',
        x: 44,
        y: 15,
        w: 22,
        h: 42,
      },
      {
        id: 'label',
        kind: 'label',
        label: 'Logo/标签细节',
        description: '保留 Logo、标签文字和品牌布局',
        priority: 'secondary',
        x: 70,
        y: 12,
        w: 22,
        h: 24,
      },
      {
        id: 'material',
        kind: 'material',
        label: '材质特写',
        description: '表面质感、反射和细节纹理',
        priority: 'reference',
        x: 70,
        y: 44,
        w: 22,
        h: 24,
      },
    ],
  },
  {
    id: 'custom',
    label: '自定义版式',
    subjectKind: 'object',
    blocks: [],
  },
];

const TOOL_LABELS = {
  camera: '转换视角',
  lighting: '调整光照',
  storyboard: '生成分镜图',
  layout: '生成三视图',
};

const MODEL_STYLE_LABELS = {
  generic: '通用',
  'gpt-image-2': 'GPT-image-2',
  'nano-banana': 'Nano Banana',
};

const CAMERA_MODE_LABELS = {
  edit: '调整现有图',
  generate: '新生成图片',
};

const CAMERA_EDIT_STRATEGY_LABELS = {
  'subject-rotate': '主体旋转',
  'camera-rotate': '摄像机旋转',
};

const DEFAULT_CAMERA_CONFIG = {
  mode: 'edit',
  editStrategy: 'camera-rotate',
  focalLength: 35,
  distance: 6,
  angle: 20,
  height: 1.6,
  position: { x: 3, y: 2, z: 6 },
  target: { x: 0, y: 1, z: 0 },
  shotSize: '中景',
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
  layoutPreset: 'grid-4',
  aspectRatio: '16:9',
  stylePreset: 'cinematic-realistic',
  customStyle: '',
  includeShotNumbers: false,
  noText: true,
  continuity: true,
  shots: [
    { id: 'shot-1', duration: '', content: '', note: '' },
    { id: 'shot-2', duration: '', content: '', note: '' },
    { id: 'shot-3', duration: '', content: '', note: '' },
    { id: 'shot-4', duration: '', content: '', note: '' },
  ],
};

const DEFAULT_LAYOUT_CONFIG = {
  template: 'three-view',
  subjectKind: 'character',
  blocks: LAYOUT_TEMPLATE_PRESETS[0].blocks,
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

function getOptionLabel(options, id, fallback) {
  return options.find((option) => option.id === id)?.label || fallback;
}

function getModelStyleLabel(modelStyle) {
  return MODEL_STYLE_LABELS[modelStyle] || MODEL_STYLE_LABELS.generic;
}

function getCameraModeLabel(mode) {
  return CAMERA_MODE_LABELS[mode] || CAMERA_MODE_LABELS.edit;
}

function getCameraEditStrategyLabel(editStrategy) {
  return CAMERA_EDIT_STRATEGY_LABELS[editStrategy] || CAMERA_EDIT_STRATEGY_LABELS['camera-rotate'];
}

function getLayoutTemplate(template) {
  return LAYOUT_TEMPLATE_PRESETS.find((item) => item.id === template) || LAYOUT_TEMPLATE_PRESETS[0];
}

function getBlockKindLabel(kind) {
  return (
    {
      front: '正面',
      side: '侧面',
      back: '背面',
      detail: '细节',
      material: '材质',
      color: '颜色变体',
      pose: '姿态',
      label: 'Logo/标签',
      custom: '自定义',
    }[kind] || '自定义'
  );
}

function normalizeLayoutBlock(block, fallback, index) {
  const item = asObject(block);
  return {
    id: asText(item.id, fallback?.id || `block-${index + 1}`),
    kind: asText(item.kind, fallback?.kind || 'custom'),
    label: asText(item.label, fallback?.label || `内容块 ${index + 1}`),
    description: asText(item.description, fallback?.description || ''),
    priority: ['primary', 'secondary', 'reference'].includes(item.priority)
      ? item.priority
      : fallback?.priority || (index === 0 ? 'primary' : 'secondary'),
    x: Math.max(0, Math.min(100, asNumber(item.x, fallback?.x ?? 8))),
    y: Math.max(0, Math.min(100, asNumber(item.y, fallback?.y ?? 12))),
    w: Math.max(8, Math.min(100, asNumber(item.w, fallback?.w ?? 24))),
    h: Math.max(8, Math.min(100, asNumber(item.h, fallback?.h ?? 40))),
  };
}

export function getPromptHelperToolLabel(tool) {
  return TOOL_LABELS[tool] || TOOL_LABELS.camera;
}

export function normalizePromptHelperData(data = {}) {
  const source = asObject(data);
  const activeTool = Object.values(PROMPT_HELPER_TOOLS).includes(source.activeTool)
    ? source.activeTool
    : PROMPT_HELPER_TOOLS.camera;
  const modelStyle = Object.values(PROMPT_HELPER_MODEL_STYLES).includes(source.modelStyle)
    ? source.modelStyle
    : PROMPT_HELPER_MODEL_STYLES.generic;
  const cameraSource = asObject(source.cameraConfig);
  const lightingSource = asObject(source.lightingConfig);
  const storyboardSource = asObject(source.storyboardConfig);
  const layoutSource = asObject(source.layoutConfig);

  const cameraConfig = {
    mode: Object.values(PROMPT_HELPER_CAMERA_MODES).includes(cameraSource.mode)
      ? cameraSource.mode
      : DEFAULT_CAMERA_CONFIG.mode,
    editStrategy: Object.values(PROMPT_HELPER_CAMERA_EDIT_STRATEGIES).includes(cameraSource.editStrategy)
      ? cameraSource.editStrategy
      : DEFAULT_CAMERA_CONFIG.editStrategy,
    focalLength: asNumber(cameraSource.focalLength, DEFAULT_CAMERA_CONFIG.focalLength),
    distance: asNumber(cameraSource.distance, DEFAULT_CAMERA_CONFIG.distance),
    angle: asNumber(cameraSource.angle, DEFAULT_CAMERA_CONFIG.angle),
    height: asNumber(cameraSource.height, DEFAULT_CAMERA_CONFIG.height),
    position: normalizePoint(cameraSource.position, DEFAULT_CAMERA_CONFIG.position),
    target: normalizePoint(cameraSource.target, DEFAULT_CAMERA_CONFIG.target),
    shotSize: asText(cameraSource.shotSize, DEFAULT_CAMERA_CONFIG.shotSize),
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

  const rawShots = Array.isArray(storyboardSource.shots) ? storyboardSource.shots : DEFAULT_STORYBOARD_CONFIG.shots;
  const hasExplicitStoryboardSize = storyboardSource.shotCount != null || storyboardSource.aspectRatio != null;
  const layoutPreset = STORYBOARD_LAYOUT_PRESETS.some((item) => item.id === storyboardSource.layoutPreset)
    ? storyboardSource.layoutPreset
    : hasExplicitStoryboardSize
      ? 'custom'
      : DEFAULT_STORYBOARD_CONFIG.layoutPreset;
  const layoutSpec = STORYBOARD_LAYOUT_PRESETS.find((item) => item.id === layoutPreset) || STORYBOARD_LAYOUT_PRESETS[0];
  const isCustomLayout = layoutPreset === 'custom';
  const shotCount = isCustomLayout
    ? Math.max(1, Math.min(12, Math.trunc(asNumber(storyboardSource.shotCount, DEFAULT_STORYBOARD_CONFIG.shotCount))))
    : layoutSpec.shotCount;
  const aspectRatio = isCustomLayout
    ? asText(storyboardSource.aspectRatio, DEFAULT_STORYBOARD_CONFIG.aspectRatio)
    : layoutSpec.aspectRatio;
  const stylePreset = STORYBOARD_STYLE_PRESETS.some((item) => item.id === storyboardSource.stylePreset)
    ? storyboardSource.stylePreset
    : storyboardSource.style
      ? 'custom'
      : DEFAULT_STORYBOARD_CONFIG.stylePreset;
  const storyboardConfig = {
    shotCount,
    layoutPreset,
    aspectRatio,
    stylePreset,
    customStyle: asText(
      storyboardSource.customStyle,
      asText(storyboardSource.style, DEFAULT_STORYBOARD_CONFIG.customStyle),
    ),
    includeShotNumbers: storyboardSource.includeShotNumbers === true,
    noText: storyboardSource.noText !== false,
    continuity: storyboardSource.continuity !== false,
    shots: Array.from({ length: shotCount }, (_, index) => {
      const item = asObject(rawShots[index]);
      const fallback = DEFAULT_STORYBOARD_CONFIG.shots[index % DEFAULT_STORYBOARD_CONFIG.shots.length];
      const legacyContent = asText(item.action, '');
      const legacyNoteParts = [item.camera, item.shotSize, item.emotion, item.transition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      return {
        id: asText(item.id, `shot-${index + 1}`),
        duration: asText(item.duration, fallback.duration),
        content: asText(item.content, legacyContent || fallback.content),
        note: asText(item.note, legacyNoteParts.join('；') || fallback.note),
      };
    }),
  };

  const hasLegacyBlocks = Array.isArray(layoutSource.blocks) && layoutSource.blocks.length > 0;
  const template = LAYOUT_TEMPLATE_PRESETS.some((item) => item.id === layoutSource.template)
    ? layoutSource.template
    : hasLegacyBlocks
      ? 'custom'
      : DEFAULT_LAYOUT_CONFIG.template;
  const layoutTemplate = getLayoutTemplate(template);
  const rawBlocks = hasLegacyBlocks ? layoutSource.blocks : layoutTemplate.blocks;
  const layoutConfig = {
    template,
    subjectKind: ['character', 'product', 'object'].includes(layoutSource.subjectKind)
      ? layoutSource.subjectKind
      : layoutTemplate.subjectKind || DEFAULT_LAYOUT_CONFIG.subjectKind,
    consistency: layoutSource.consistency !== false,
    blocks: rawBlocks
      .slice(0, 12)
      .map((block, index) =>
        normalizeLayoutBlock(
          block,
          layoutTemplate.blocks[index] || DEFAULT_LAYOUT_CONFIG.blocks[index % DEFAULT_LAYOUT_CONFIG.blocks.length],
          index,
        ),
      ),
  };

  return {
    activeTool,
    modelStyle,
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

function normalizeDegrees(value) {
  const normalized = Number(value) % 360;
  if (!Number.isFinite(normalized)) return 0;
  if (normalized > 180) return normalized - 360;
  if (normalized <= -180) return normalized + 360;
  return normalized;
}

function getCameraViewTerms(config) {
  const normalizedAngle = normalizeDegrees(config.angle);
  const absAngle = Math.abs(normalizedAngle);
  const side = normalizedAngle >= 0 ? 'right' : 'left';

  if (absAngle >= 157.5) {
    return {
      chinese: '背面视角',
      english: 'back view',
      detail: 'camera behind the subject',
      visibility: 'show the back of the subject; face should not be visible',
      structuralFocus: 'emphasize the back silhouette, back clothing details, rear structure, and back-facing composition',
    };
  }
  if (absAngle >= 112.5) {
    return {
      chinese: side === 'right' ? '后侧三分之四视角（偏右后）' : '后侧三分之四视角（偏左后）',
      english: side === 'right' ? 'rear three-quarter right view' : 'rear three-quarter left view',
      detail: side === 'right' ? 'camera behind the subject on the right side' : 'camera behind the subject on the left side',
      visibility:
        side === 'right'
          ? 'mostly show the back and the right side of the subject; face should be hidden or only minimally visible'
          : 'mostly show the back and the left side of the subject; face should be hidden or only minimally visible',
      structuralFocus:
        'emphasize rear silhouette, shoulder/back structure, and the visible side contour while keeping the composition clearly back-oriented',
    };
  }
  if (absAngle >= 67.5) {
    return {
      chinese: side === 'right' ? '右侧面视角' : '左侧面视角',
      english: side === 'right' ? 'right side view' : 'left side view',
      detail: side === 'right' ? 'camera on the right side of the subject' : 'camera on the left side of the subject',
      visibility:
        side === 'right'
          ? 'show the right profile of the subject; avoid a front-facing result'
          : 'show the left profile of the subject; avoid a front-facing result',
      structuralFocus: 'emphasize side profile, thickness, silhouette, and side contour',
    };
  }
  if (absAngle >= 22.5) {
    return {
      chinese: side === 'right' ? '前侧三分之四视角（偏右前）' : '前侧三分之四视角（偏左前）',
      english: side === 'right' ? 'front three-quarter right view' : 'front three-quarter left view',
      detail: side === 'right' ? 'camera in front of the subject on the right side' : 'camera in front of the subject on the left side',
      visibility:
        side === 'right'
          ? 'show the front of the subject with more of the right side visible'
          : 'show the front of the subject with more of the left side visible',
      structuralFocus: 'emphasize frontal identity with clear depth, side contour, and three-quarter composition',
    };
  }
  return {
    chinese: '正面视角',
    english: 'front view',
    detail: 'camera directly in front of the subject',
    visibility: 'show the front of the subject clearly',
    structuralFocus: 'emphasize frontal identity, facial visibility, front silhouette, and symmetrical front-facing composition',
  };
}

function getCameraShotTerms(config) {
  const shotText = String(config.shotSize || '');
  const shotType =
    {
      极近特写: 'extreme close-up',
      特写: 'close-up',
      近景: 'medium close-up',
      半身近景: 'medium close-up',
      中景: 'medium shot',
      中全景: 'medium-full shot',
      全景: 'wide shot',
      远景: 'wide shot',
      超远景: 'extreme wide shot',
      产品近景: 'product close-up',
      微距: 'macro shot',
    }[shotText] || 'medium shot';
  const focalLength = Number(config.focalLength);
  const lens =
    focalLength >= 95
      ? '100mm macro lens feel'
      : focalLength >= 75
        ? '85mm portrait lens feel'
        : focalLength <= 28
          ? 'wide-angle lens feel'
          : focalLength <= 40
            ? '35mm lens feel'
            : '50mm natural perspective lens feel';
  const focus =
    focalLength >= 75 ? 'shallow depth of field' : focalLength <= 28 ? 'deep spatial perspective' : 'sharp focus';
  const angle =
    Math.abs(config.angle) <= 10 ? 'front-facing camera alignment' : 'three-quarter camera alignment';
  return { shotType, lens, focus, angle };
}

function getCameraVerticalTerms(config) {
  const dx = Number(config.target.x) - Number(config.position.x);
  const dy = Number(config.target.y) - Number(config.position.y);
  const verticalOffset = Number(config.position.y) - Number(config.target.y);
  const dz = Number(config.target.z) - Number(config.position.z);
  const horizontalDistance = Math.max(0.1, Math.hypot(dx, dz));
  const tiltRadians = Math.atan2(Math.abs(dy), horizontalDistance);
  const tiltDegrees = Number(((tiltRadians * 180) / Math.PI).toFixed(0));

  if (verticalOffset >= 3.5 || (verticalOffset >= 1.8 && tiltDegrees >= 45)) {
    return {
      chinese: '顶视俯拍',
      english: 'top-down bird-eye view',
      relation: 'downward',
      pitchLabel: '俯角',
      pitchDegrees: tiltDegrees,
      cameraPose: 'camera high above the subject looking steeply downward',
      visibility: 'show the top planes of the subject and environment clearly; emphasize ground spread and suppress underside visibility',
      structuralFocus: 'top silhouette, crown/shoulder top surfaces, floor layout, radial spatial spread, and a strong downward perspective',
      instruction:
        'the image must read as a true top-down shot rather than a normal eye-level image with the subject merely tilted',
      avoid: ['不要保持平视镜头', '不要仍然像普通正面照', '不要缺失地面铺展和顶部可见面'],
      keywords: 'bird-eye view, top-down camera, steep downward tilt, visible top planes, expanded ground plane',
    };
  }

  if (verticalOffset >= 1.2 || (verticalOffset > 0.4 && tiltDegrees >= 22)) {
    return {
      chinese: '高位俯拍',
      english: 'high-angle downward view',
      relation: 'downward',
      pitchLabel: '俯角',
      pitchDegrees: tiltDegrees,
      cameraPose: 'camera above the subject looking downward',
      visibility: 'show more top-facing surfaces and more ground behind or around the subject; reduce underside visibility',
      structuralFocus: 'upper silhouette, shoulder/head top planes, floor perspective expansion, and a clearly lowered horizon',
      instruction:
        'the composition must feel like the camera moved upward and tilted down, not like the subject simply leaned backward',
      avoid: ['不要保持平视构图', '不要仍然像轻微角度变化的正面照', '不要忽略地面透视和顶部面'],
      keywords: 'high-angle shot, downward tilt, visible top surfaces, lowered horizon, expanded ground perspective',
    };
  }

  if (verticalOffset <= -3.5 || (verticalOffset <= -1.8 && tiltDegrees >= 45)) {
    return {
      chinese: '极低位仰拍',
      english: 'extreme low-angle upward view',
      relation: 'upward',
      pitchLabel: '仰角',
      pitchDegrees: tiltDegrees,
      cameraPose: 'camera far below the subject looking steeply upward',
      visibility: 'show the underside of forms clearly; emphasize sky or ceiling dominance and suppress top-down floor visibility',
      structuralFocus: 'upward monumentality, underside planes, stretched vertical lines, towering scale, and strong upward perspective',
      instruction:
        'the image must read as an obvious worm-eye shot rather than an eye-level image with the subject enlarged',
      avoid: ['不要保持平视镜头', '不要仍然像普通视角只把主体放大', '不要缺失天空或上方背景占比'],
      keywords: 'worm-eye view, extreme low-angle shot, steep upward tilt, visible underside, towering perspective',
    };
  }

  if (verticalOffset <= -1.2 || (verticalOffset < -0.4 && tiltDegrees >= 22)) {
    return {
      chinese: '低位仰拍',
      english: 'low-angle upward view',
      relation: 'upward',
      pitchLabel: '仰角',
      pitchDegrees: tiltDegrees,
      cameraPose: 'camera below the subject looking upward',
      visibility: 'show more underside surfaces and more sky, ceiling, or upper background; reduce top-down floor visibility',
      structuralFocus: 'lower silhouette dominance, underside planes, upward vertical convergence, and a clearly raised horizon',
      instruction:
        'the composition must feel like the camera dropped lower and tilted up, not like the subject simply leaned forward',
      avoid: ['不要保持平视构图', '不要仍然像普通正面照', '不要忽略上方背景和底部可见面'],
      keywords: 'low-angle shot, upward tilt, visible underside, raised horizon, upper background dominance',
    };
  }

  return {
    chinese: '平视',
    english: 'eye-level view',
    relation: 'level',
    pitchLabel: '俯仰角',
    pitchDegrees: 0,
    cameraPose: 'camera roughly level with the subject',
    visibility: 'maintain balanced visibility of the subject without strong top-down or bottom-up distortion',
    structuralFocus: 'neutral perspective, balanced horizon, and natural spatial proportion',
    instruction: 'the image should stay close to an eye-level viewing relationship',
    avoid: ['不要误生成明显俯拍', '不要误生成明显仰拍'],
    keywords: 'eye-level shot, neutral vertical perspective, balanced horizon',
  };
}

function getCameraSceneTerms(config) {
  const strategy =
    config.editStrategy === PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.subjectRotate
      ? PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.subjectRotate
      : PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.cameraRotate;

  if (strategy === PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.subjectRotate) {
    return {
      strategy,
      chinese: '主体旋转',
      english: 'subject rotates in place',
      intent: '保持场景和机位基本不变，主要让主体自身转向目标视角',
      sceneRule: '背景、场景布局、透视关系、镜头位置和整体画面框架尽量保持稳定，不要明显改成另一侧机位。',
      structuralRule: '把这次变化理解为主体在同一镜头里原地转身或转向，而不是摄像机绕场景移动。',
      avoid: ['不要明显改变背景布局', '不要把场景重建成另一侧视角', '不要让机位和透视整体换边'],
      keywords: 'subject turns in place, locked background, stable framing, same camera position, same scene layout',
    };
  }

  return {
    strategy,
    chinese: '摄像机旋转',
    english: 'camera rotates around the subject',
    intent: '保持主体身份一致，并让摄像机绕主体改变观察角度。',
    sceneRule: '场景、背景、透视、遮挡、景深、阴影方向和环境可见面都必须随新机位一致变化，不要只让主体转过去而背景基本不变。',
    structuralRule: '把这次变化理解为摄像机围绕主体移动后的重新拍摄结果，需要同步重建背景透视和空间关系。',
    avoid: ['不要让背景保持原样不动', '不要像剪贴拼接一样只旋转主体', '不要保留旧机位的透视和遮挡关系'],
    keywords: 'camera orbit around subject, regenerated background perspective, scene parallax, updated occlusion, rebuilt environment viewpoint',
  };
}

function buildNanoPrompt(payload) {
  return [
    '请严格根据以下结构化提示词生成图片，不要解释，只执行图像生成请求。如有冲突，以 keep、change、avoid、priority 字段为准。',
    '',
    JSON.stringify(payload, null, 2),
  ];
}

function buildCameraPrompt(config, modelStyle) {
  const mode = config.mode === PROMPT_HELPER_CAMERA_MODES.generate ? PROMPT_HELPER_CAMERA_MODES.generate : PROMPT_HELPER_CAMERA_MODES.edit;
  const terms = getCameraShotTerms(config);
  const viewTerms = getCameraViewTerms(config);
  const verticalTerms = getCameraVerticalTerms(config);
  const sceneTerms = getCameraSceneTerms(config);
  const isGenerateMode = mode === PROMPT_HELPER_CAMERA_MODES.generate;
  const keep = isGenerateMode ? [] : ['主体身份', '服装', '材质', '比例', '关键特征'];
  const change = isGenerateMode
    ? [
        `新生成 ${viewTerms.english} / ${terms.shotType} 视角构图`,
        `垂直视角为 ${verticalTerms.english}`,
        `镜头语言改为 ${terms.lens}`,
        terms.focus,
      ]
    : [
        `观看视角改为 ${viewTerms.english} / ${terms.shotType}`,
        `垂直视角改为 ${verticalTerms.english}`,
        `镜头语言改为 ${terms.lens}`,
        terms.focus,
        `视角变化方式为 ${sceneTerms.english}`,
      ];
  const avoid = isGenerateMode
    ? ['不要偏离基础提示词主体设定', '不要随意改色或改材质', '不要添加无关元素', '不要添加文字、水印或标签']
    : [
        '不要改变主体结构',
        '不要改变身份',
        '不要改变产品颜色、Logo 或标签文字',
        '不要添加无关元素',
        ...sceneTerms.avoid,
      ];
  avoid.push(...verticalTerms.avoid);
  if (viewTerms.english === 'back view') {
    avoid.push('不要生成正面或侧脸', '不要让脸正对镜头');
  } else if (viewTerms.english.includes('rear three-quarter')) {
    avoid.push('不要变成正面照', '不要让脸完整正对镜头');
  } else if (viewTerms.english.includes('side view')) {
    avoid.push('不要变成正面照');
  }
  const finalPrompt = isGenerateMode
    ? `Generate a fresh image of the described subject as a ${viewTerms.english} ${terms.shotType} using ${terms.lens}, ${terms.angle}, and ${terms.focus}. Horizontal viewpoint: ${viewTerms.detail}. Vertical viewpoint: ${verticalTerms.cameraPose}. ${viewTerms.visibility}. ${viewTerms.structuralFocus}. ${verticalTerms.visibility}. ${verticalTerms.structuralFocus}. ${verticalTerms.instruction} Follow the base prompt as the creative source, but do not assume an existing image must be preserved exactly. Do not add unrelated elements, text, watermark, or unwanted distortions.`
    : `Keep the subject identity, clothing, material, proportions, and key details unchanged. Change only the camera view to a ${viewTerms.english} ${terms.shotType} using ${terms.lens}, ${terms.angle}, and ${terms.focus}. Horizontal viewpoint: ${viewTerms.detail}. Vertical viewpoint: ${verticalTerms.cameraPose}. ${viewTerms.visibility}. ${viewTerms.structuralFocus}. ${verticalTerms.visibility}. ${verticalTerms.structuralFocus}. ${verticalTerms.instruction} ${sceneTerms.intent} ${sceneTerms.sceneRule} ${sceneTerms.structuralRule} Do not alter the subject structure, identity, color, logo, label text, or add unrelated elements.`;

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.gptImage2) {
    return [
      isGenerateMode
        ? '辅助类型：转换视角 / camera-directed image generation for GPT-image-2.'
        : '辅助类型：转换视角 / camera view transformation for GPT-image-2.',
      finalPrompt,
      `Target viewpoint: ${viewTerms.chinese} (${viewTerms.english}).`,
      `Vertical viewpoint: ${verticalTerms.chinese} (${verticalTerms.english}), ${verticalTerms.pitchLabel} about ${verticalTerms.pitchDegrees} degrees.`,
      !isGenerateMode ? `Transformation strategy: ${sceneTerms.chinese} (${sceneTerms.english}).` : null,
      `Camera position: ${formatPoint(config.position)}. Target point: ${formatPoint(config.target)}. Focal length: ${config.focalLength}mm.`,
      `Avoid: ${avoid.join('; ')}.`,
      isGenerateMode ? 'Generate a fresh image rather than editing an existing image.' : 'Edit the existing image rather than generating a different subject.',
    ].filter(Boolean);
  }

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.nanoBanana) {
    return buildNanoPrompt({
      task: isGenerateMode ? 'text_to_image' : 'image_edit',
      intent: isGenerateMode ? '生成新视角图片' : '转换视角并保持主体一致',
      camera: {
        transformation_strategy: isGenerateMode ? null : sceneTerms.english,
        transformation_strategy_label: isGenerateMode ? null : sceneTerms.chinese,
        scene_rule: isGenerateMode ? null : sceneTerms.sceneRule,
        viewpoint_label: viewTerms.chinese,
        viewpoint: viewTerms.english,
        viewpoint_instruction: viewTerms.visibility,
        vertical_viewpoint_label: verticalTerms.chinese,
        vertical_viewpoint: verticalTerms.english,
        vertical_viewpoint_instruction: verticalTerms.visibility,
        vertical_pitch_label: verticalTerms.pitchLabel,
        vertical_pitch_degrees: verticalTerms.pitchDegrees,
        composition_focus: viewTerms.structuralFocus,
        vertical_composition_focus: verticalTerms.structuralFocus,
        shot_type: terms.shotType,
        lens: terms.lens,
        camera_angle: terms.angle,
        focus: terms.focus,
        focal_length: `${config.focalLength}mm`,
        position: formatPoint(config.position),
        target: formatPoint(config.target),
      },
      keep,
      change,
      avoid,
      priority: {
        highest: [
          isGenerateMode ? '准确生成目标视角和镜头语言' : '保持主体身份、比例、材质和关键特征一致',
        ],
        medium: [
          isGenerateMode
            ? '遵循基础提示词完成新画面'
            : sceneTerms.strategy === PROMPT_HELPER_CAMERA_EDIT_STRATEGIES.cameraRotate
              ? '同步重建场景透视、背景可见面和空间关系'
              : '尽量锁定背景和机位，只让主体自身转向',
        ],
      },
      final_prompt: finalPrompt,
    });
  }

  if (isGenerateMode) {
    return [
      '辅助类型：转换视角 / camera-directed image generation.',
      `根据基础提示词新生成一张${config.shotSize}（${terms.shotType}）图片，目标视角为${viewTerms.chinese}（${viewTerms.english}），摄像机位置为 ${formatPoint(config.position)}，朝向主体目标点 ${formatPoint(config.target)}。`,
      `镜头焦距感约 ${config.focalLength}mm，机位距离约 ${config.distance}m，高度约 ${config.height}m，水平角度约 ${config.angle}°。`,
      `垂直视角：${verticalTerms.chinese}（${verticalTerms.english}），${verticalTerms.pitchLabel}约 ${verticalTerms.pitchDegrees}°。`,
      `镜头语言：${terms.lens}, ${terms.angle}, ${terms.focus}, stable composition.`,
      `视角要求：${viewTerms.detail}；${viewTerms.visibility}；${viewTerms.structuralFocus}；${verticalTerms.cameraPose}；${verticalTerms.visibility}；${verticalTerms.structuralFocus}。`,
      `负向约束：${avoid.join('；')}。`,
      '这是新生成模式，不要求沿用现有图片中的主体细节或构图，只需遵循基础提示词并生成目标视角的新画面。',
      '这是新生成模式，不要求参考原图重绘；重点是按提示词直接生成目标视角的新画面。',
      `English keywords: fresh image generation, camera angle, focal length, perspective, composition, subject consistency, ${verticalTerms.keywords}.`,
    ];
  }

  return [
    '辅助类型：转换视角 / camera view transformation.',
    `将画面转换为${config.shotSize}（${terms.shotType}），目标视角为${viewTerms.chinese}（${viewTerms.english}），摄像机位置为 ${formatPoint(config.position)}，朝向主体目标点 ${formatPoint(config.target)}。`,
    `变化方式：${sceneTerms.chinese}（${sceneTerms.english}）。`,
    `镜头焦距感约 ${config.focalLength}mm，机位距离约 ${config.distance}m，高度约 ${config.height}m，水平角度约 ${config.angle}°。`,
    `垂直视角：${verticalTerms.chinese}（${verticalTerms.english}），${verticalTerms.pitchLabel}约 ${verticalTerms.pitchDegrees}°。`,
    `镜头语言：${terms.lens}, ${terms.angle}, ${terms.focus}, stable composition.`,
    `视角要求：${viewTerms.detail}；${viewTerms.visibility}；${viewTerms.structuralFocus}；${verticalTerms.cameraPose}；${verticalTerms.visibility}；${verticalTerms.structuralFocus}。`,
    `场景约束：${sceneTerms.sceneRule}`,
    `纵向构图约束：${verticalTerms.instruction}`,
    `空间解释：${sceneTerms.structuralRule}`,
    `负向约束：${avoid.join('；')}。`,
    '保持主体身份、服装、材质、比例和关键特征一致，只改变观看视角与镜头语言。',
    `English keywords: consistent subject, camera angle, focal length, perspective, composition, stable identity, ${sceneTerms.keywords}, ${verticalTerms.keywords}.`,
  ];
}

function buildLightingPrompt(config, modelStyle) {
  const modeText =
    config.mode === 'reshape' ? '重塑光线，替换原有主要光照关系' : '增加光线，在原有光照基础上叠加新的灯光';
  const lightLines =
    config.lights.length > 0
      ? config.lights.map(
          (light, index) =>
            `${index + 1}. ${light.name}: ${light.type} light, intensity ${light.intensity.toFixed(1)}, color ${light.color}, position ${formatPoint(light.position)}, direction ${formatPoint(light.direction)}.`,
        )
      : ['无新增灯光对象，保持柔和自然光。'];
  const finalPrompt = `Use ${config.mode === 'reshape' ? 'a rebuilt lighting setup that replaces the main light relationship' : 'additional lighting layered on top of the existing illumination'}. Keep the subject structure unchanged. Create realistic shadows, clear light direction, controlled contrast, soft falloff, and believable material response.`;

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.gptImage2) {
    return [
      '辅助类型：调整光照 / lighting design for GPT-image-2.',
      finalPrompt,
      'Lighting setup:',
      ...lightLines,
      'Avoid changing the subject identity, product structure, clothing color, logo, or label text.',
    ];
  }

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.nanoBanana) {
    return buildNanoPrompt({
      task: 'image_edit',
      intent: config.mode === 'reshape' ? '重塑整体光照关系' : '在原图基础上增加灯光',
      lighting: {
        mode: config.mode,
        description: modeText,
        lights: config.lights.map((light) => ({
          name: light.name,
          type: `${light.type} light`,
          intensity: light.intensity,
          color: light.color,
          position: formatPoint(light.position),
          direction: formatPoint(light.direction),
        })),
        requirements: [
          'realistic shadows',
          'clear light direction',
          'controlled contrast',
          'soft falloff',
          'material response',
        ],
      },
      keep: ['主体结构', '主体身份', '产品比例', 'Logo 和标签文字'],
      change: [modeText],
      avoid: ['不要改变主体结构', '不要改变颜色和身份', '不要添加无关物体'],
      priority: {
        highest: ['保持主体结构和身份不变'],
        medium: ['根据灯光配置调整光线方向、阴影和材质反射'],
      },
      final_prompt: finalPrompt,
    });
  }

  return [
    '辅助类型：调整光照 / lighting design.',
    `光照模式：${modeText}。`,
    '灯光配置：',
    ...lightLines,
    '强调合理阴影、光线方向、受控对比度、柔和衰减、体积感、明暗层次和材质反射，不改变主体结构。',
    'English keywords: cinematic lighting, realistic shadows, light direction, soft falloff, material response.',
  ];
}

function buildStoryboardPrompt(config, modelStyle) {
  const layoutText = getOptionLabel(STORYBOARD_LAYOUT_PRESETS, config.layoutPreset, '4格横版');
  const styleText =
    config.stylePreset === 'custom'
      ? asText(config.customStyle, '电影感写实')
      : getOptionLabel(STORYBOARD_STYLE_PRESETS, config.stylePreset, '电影感写实');
  const textPolicy = config.noText
    ? '画面内不要出现字幕、编号、文字标签、对白气泡或水印。'
    : '允许画面内保留必要的简短文字，但不要添加大段说明。';
  const numberingPolicy = config.includeShotNumbers
    ? '可以在每个分镜格的角落或格外侧使用简洁镜头编号，编号不要遮挡画面主体。'
    : '不要在画面内或格子外添加镜头编号。';
  const continuityPolicy = config.continuity
    ? '保持主体身份、服装、道具、场景方位和视觉风格连续一致。'
    : '允许每个镜头根据用户填写内容自由变化。';
  const shotLines = config.shots.flatMap((shot, index) => {
    const details = [
      shot.duration ? `时长：${shot.duration}` : '',
      shot.content ? `内容：${shot.content}` : '',
      shot.note ? `备注：${shot.note}` : '',
    ].filter(Boolean);
    return details.length > 0 ? [`镜头 ${index + 1}: ${details.join('，')}。`] : [];
  });
  const finalPrompt = `Create a ${config.shotCount}-panel storyboard sheet on a pure white background with a uniform grid and clean panel borders. Each panel should contain one storyboard image with clear subject, action, scene, composition, and lighting. Keep continuity of identity, props, scene direction, and visual style unless specified otherwise. ${config.noText ? 'No subtitles, labels, speech bubbles, watermark, or extra text.' : 'Only use necessary short text when explicitly needed.'}`;

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.gptImage2) {
    return [
      '辅助类型：生成分镜图 / storyboard sheet for GPT-image-2.',
      finalPrompt,
      `Layout: ${layoutText}. Whole sheet aspect ratio: ${config.aspectRatio}. Visual style: ${styleText}.`,
      ...shotLines,
      numberingPolicy,
    ];
  }

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.nanoBanana) {
    return buildNanoPrompt({
      task: 'text_to_image',
      intent: `生成 ${config.shotCount} 格固定网格分镜图`,
      storyboard: {
        panel_count: config.shotCount,
        layout: layoutText,
        whole_sheet_aspect_ratio: config.aspectRatio,
        style: styleText,
        panel_requirements: ['subject', 'action', 'scene', 'composition', 'lighting'],
        shots: config.shots.map((shot, index) => ({
          panel: index + 1,
          duration: shot.duration,
          content: shot.content,
          note: shot.note,
        })),
      },
      keep: config.continuity ? ['主体身份', '服装', '道具', '场景方位', '视觉风格连续一致'] : [],
      change: ['按每格内容生成对应镜头画面'],
      avoid: [
        '不要生成杂志拼贴',
        '不要生成海报排版',
        '不要生成漫画跨格',
        config.noText ? '不要添加字幕、编号、文字标签、对白气泡或水印' : '不要添加大段说明文字',
      ],
      priority: {
        highest: ['固定纯白背景、统一网格、清晰分镜框'],
        medium: ['每格包含主体、动作、场景、构图和光线'],
      },
      final_prompt: finalPrompt,
    });
  }

  return [
    '辅助类型：生成分镜图 / storyboard sheet.',
    `生成 ${config.shotCount} 格分镜图，版式为${layoutText}，整张分镜图画幅比例 ${config.aspectRatio}。`,
    '最终分镜图必须固定为纯白背景、统一网格、清晰分镜框，每格只放一张分镜头图片；按整张分镜图画幅比例安排网格和单格尺寸，不要把画幅比例理解为每个镜头单格的比例；不要生成杂志拼贴、海报排版、漫画跨格或其他自由排版风格。',
    '每个分镜格都应包含明确的主体、动作、场景、构图和光线；如果用户没有填写完整，请根据基础提示词补全，但不要把字段名写进画面。',
    `基本视觉风格：${styleText}。`,
    textPolicy,
    numberingPolicy,
    ...shotLines,
    continuityPolicy,
    '如果某个镜头没有填写内容、时长或备注，请根据基础提示词和整体设定自由补全，不要在画面上写出空字段。',
    'English keywords: white background storyboard sheet, uniform grid, clean panel borders, consistent layout, storyboard panels.',
  ];
}

function buildLayoutPrompt(config, modelStyle) {
  const template = getLayoutTemplate(config.template);
  const subjectText = config.subjectKind === 'product' ? '产品' : config.subjectKind === 'object' ? '物体' : '角色';
  const blockLines = config.blocks.map((block, index) => {
    const description = block.description ? `，说明：${block.description}` : '';
    return `${index + 1}. ${block.label}（${getBlockKindLabel(block.kind)}，${block.priority}），位置 ${block.x.toFixed(0)}%/${block.y.toFixed(0)}%，尺寸 ${block.w.toFixed(0)}% x ${block.h.toFixed(0)}%${description}。`;
  });
  const keep =
    config.subjectKind === 'product'
      ? ['产品外形', '产品颜色', 'Logo', '标签文字', '品牌布局', '产品比例']
      : ['同一主体身份', '比例', '服装或结构', '材质', '颜色', '设计细节'];
  const avoid =
    config.subjectKind === 'product'
      ? ['不要改变产品结构', '不要改变 Logo', '不要改变标签文字', '不要添加额外产品', '不要添加文字标注或水印']
      : ['不要改变主体身份', '不要改变比例', '不要添加额外角色或物体', '不要添加文字标注或水印'];
  const finalPrompt = `Create a clean ${subjectText} reference sheet on a pure white background using the ${template.label} layout. Include ${config.blocks.map((block) => block.label).join(', ')}. Keep ${keep.join(', ')} consistent across all blocks. Use orthographic reference sheet style, neutral studio lighting, clean silhouettes, consistent scale, and fixed panel placement. No text, labels, watermark, or unrelated elements.`;

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.gptImage2) {
    return [
      '辅助类型：生成三视图 / reference sheet for GPT-image-2.',
      finalPrompt,
      '按以下内容块拼成参考图版面：',
      ...blockLines,
    ];
  }

  if (modelStyle === PROMPT_HELPER_MODEL_STYLES.nanoBanana) {
    return buildNanoPrompt({
      task: 'text_to_image',
      intent: `生成${subjectText}参考图 / ${template.label}`,
      layout: {
        template: config.template,
        template_label: template.label,
        subject_kind: config.subjectKind,
        background: 'pure white background',
        blocks: config.blocks.map((block) => ({
          kind: block.kind,
          label: block.label,
          description: block.description,
          priority: block.priority,
          position: `${block.x.toFixed(0)}%/${block.y.toFixed(0)}%`,
          size: `${block.w.toFixed(0)}% x ${block.h.toFixed(0)}%`,
        })),
      },
      keep,
      change: ['按模板生成固定参考图版式'],
      avoid,
      priority: {
        highest: ['纯白背景', '固定版面块', '无文字标注', '主体一致性'],
        medium: ['orthographic reference sheet style', 'neutral studio lighting', 'consistent scale'],
      },
      final_prompt: finalPrompt,
    });
  }

  return [
    '辅助类型：生成三视图 / character or object reference sheet.',
    `版式模板：${template.label}，主体类型：${subjectText}。`,
    '固定版面要求：纯白背景，无文字内容，无标注，无水印。',
    '按以下内容块拼成参考图版面：',
    ...blockLines,
    config.consistency
      ? '所有内容块保持同一角色/物体的比例、服装、材质、颜色和设计细节一致。'
      : '允许每个内容块根据用途略微调整表现。',
    'English keywords: pure white background, no text, reference sheet, front view, side view, back view, detail view, orthographic reference sheet style, neutral studio lighting, consistent design.',
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
    lines.push(...buildLightingPrompt(normalized.lightingConfig, normalized.modelStyle));
  } else if (normalized.activeTool === PROMPT_HELPER_TOOLS.storyboard) {
    lines.push(...buildStoryboardPrompt(normalized.storyboardConfig, normalized.modelStyle));
  } else if (normalized.activeTool === PROMPT_HELPER_TOOLS.layout) {
    lines.push(...buildLayoutPrompt(normalized.layoutConfig, normalized.modelStyle));
  } else {
    lines.push(...buildCameraPrompt(normalized.cameraConfig, normalized.modelStyle));
  }

  return lines.join('\n').trim();
}

export function summarizePromptHelper(data = {}) {
  const normalized = normalizePromptHelperData(data);
  const modelLabel = getModelStyleLabel(normalized.modelStyle);
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.lighting) {
    return `${modelLabel} · ${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.lightingConfig.mode === 'reshape' ? '重塑光线' : '增加光线'} · ${normalized.lightingConfig.lights.length} 盏灯`;
  }
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.storyboard) {
    return `${modelLabel} · ${getPromptHelperToolLabel(normalized.activeTool)} · ${normalized.storyboardConfig.shotCount} 镜头 · ${normalized.storyboardConfig.aspectRatio}`;
  }
  if (normalized.activeTool === PROMPT_HELPER_TOOLS.layout) {
    const template = getLayoutTemplate(normalized.layoutConfig.template);
    return `${modelLabel} · ${getPromptHelperToolLabel(normalized.activeTool)} · ${template.label} · ${normalized.layoutConfig.blocks.length} 块`;
  }
  const cameraDetail =
    normalized.cameraConfig.mode === PROMPT_HELPER_CAMERA_MODES.generate
      ? getCameraModeLabel(normalized.cameraConfig.mode)
      : `${getCameraModeLabel(normalized.cameraConfig.mode)} · ${getCameraEditStrategyLabel(normalized.cameraConfig.editStrategy)}`;
  return `${modelLabel} · ${getPromptHelperToolLabel(normalized.activeTool)} · ${cameraDetail} · ${normalized.cameraConfig.focalLength}mm · ${normalized.cameraConfig.shotSize}`;
}
