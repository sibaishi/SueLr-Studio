export const PROMPT_HELPER_TOOLS: {
  readonly camera: 'camera';
  readonly lighting: 'lighting';
  readonly storyboard: 'storyboard';
  readonly layout: 'layout';
};

export type PromptHelperTool = 'camera' | 'lighting' | 'storyboard' | 'layout';

export type PromptHelperPoint = {
  x: number;
  y: number;
  z: number;
};

export type PromptHelperCameraConfig = {
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
  shotSize: string;
  camera: string;
  action: string;
  transition: string;
};

export type PromptHelperStoryboardConfig = {
  shotCount: number;
  shots: PromptHelperShot[];
};

export type PromptHelperLayoutBlock = {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PromptHelperLayoutConfig = {
  consistency: boolean;
  blocks: PromptHelperLayoutBlock[];
};

export type PromptHelperData = {
  activeTool: PromptHelperTool;
  baseText: string;
  cameraConfig: PromptHelperCameraConfig;
  lightingConfig: PromptHelperLightingConfig;
  storyboardConfig: PromptHelperStoryboardConfig;
  layoutConfig: PromptHelperLayoutConfig;
};

export function getPromptHelperToolLabel(tool: string): string;
export function normalizePromptHelperData(data?: Record<string, unknown>): PromptHelperData;
export function buildPromptHelperPrompt(data?: Record<string, unknown> | PromptHelperData, inputs?: Record<string, unknown>): string;
export function summarizePromptHelper(data?: Record<string, unknown> | PromptHelperData): string;
