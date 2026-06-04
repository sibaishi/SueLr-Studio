export const PROMPT_HELPER_TOOLS: {
  readonly camera: 'camera';
  readonly lighting: 'lighting';
  readonly storyboard: 'storyboard';
  readonly layout: 'layout';
};

export const PROMPT_HELPER_MODEL_STYLES: {
  readonly generic: 'generic';
  readonly gptImage2: 'gpt-image-2';
  readonly nanoBanana: 'nano-banana';
};

export const PROMPT_HELPER_CAMERA_MODES: {
  readonly edit: 'edit';
  readonly generate: 'generate';
};

export const STORYBOARD_LAYOUT_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly shotCount: number | null;
  readonly aspectRatio: string | null;
  readonly columns: number | null;
}[];

export const STORYBOARD_STYLE_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
}[];

export const LAYOUT_TEMPLATE_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: 'character' | 'product' | 'object';
  readonly blocks: readonly PromptHelperLayoutBlock[];
}[];

export type PromptHelperTool = 'camera' | 'lighting' | 'storyboard' | 'layout';
export type PromptHelperModelStyle = 'generic' | 'gpt-image-2' | 'nano-banana';
export type PromptHelperCameraMode = 'edit' | 'generate';

export type PromptHelperPoint = {
  x: number;
  y: number;
  z: number;
};

export type PromptHelperCameraConfig = {
  mode: PromptHelperCameraMode;
  focalLength: number;
  distance: number;
  angle: number;
  height: number;
  position: PromptHelperPoint;
  target: PromptHelperPoint;
  shotSize: string;
  preserveSubject: boolean;
};

export type PromptHelperLight = {
  id: string;
  type: 'area' | 'directional' | 'spot';
  name: string;
  intensity: number;
  color: string;
  position: PromptHelperPoint;
  direction: PromptHelperPoint;
};

export type PromptHelperLightingConfig = {
  mode: 'add' | 'reshape';
  lights: PromptHelperLight[];
};

export type PromptHelperShot = {
  id: string;
  duration: string;
  content: string;
  note: string;
};

export type PromptHelperStoryboardConfig = {
  shotCount: number;
  layoutPreset: string;
  aspectRatio: string;
  stylePreset: string;
  customStyle: string;
  includeShotNumbers: boolean;
  noText: boolean;
  continuity: boolean;
  shots: PromptHelperShot[];
};

export type PromptHelperLayoutBlock = {
  id: string;
  kind: string;
  label: string;
  description: string;
  priority: 'primary' | 'secondary' | 'reference';
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PromptHelperLayoutConfig = {
  template: string;
  subjectKind: 'character' | 'product' | 'object';
  consistency: boolean;
  blocks: PromptHelperLayoutBlock[];
};

export type PromptHelperData = {
  activeTool: PromptHelperTool;
  modelStyle: PromptHelperModelStyle;
  baseText: string;
  cameraConfig: PromptHelperCameraConfig;
  lightingConfig: PromptHelperLightingConfig;
  storyboardConfig: PromptHelperStoryboardConfig;
  layoutConfig: PromptHelperLayoutConfig;
};

export function getPromptHelperToolLabel(tool: string): string;
export function normalizePromptHelperData(data?: Record<string, unknown>): PromptHelperData;
export function buildPromptHelperPrompt(
  data?: Record<string, unknown> | PromptHelperData,
  inputs?: Record<string, unknown>,
): string;
export function summarizePromptHelper(data?: Record<string, unknown> | PromptHelperData): string;
