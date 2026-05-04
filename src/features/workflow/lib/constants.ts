import type { NodeTypeDef } from './types';
import { WORKFLOW_NODE_REGISTRY, getNodeDef as getSharedNodeDef } from '@/shared/workflow/node-registry';

export const GRID_SIZE = 28;

export const NODE_SIZE_UNITS: Record<string, { w: number; h: number }> = {
  group: { w: 14, h: 10 },
  textInput: { w: 12, h: 7 },
  imageInput: { w: 13, h: 13 },
  maskInput: { w: 13, h: 14 },
  imageResize: { w: 14, h: 12 },
  videoInput: { w: 13, h: 11 },
  audioInput: { w: 13, h: 9 },
  apiKeyInput: { w: 14, h: 21 },
  textMerge: { w: 11, h: 8 },
  imageMerge: { w: 11, h: 8 },
  videoMerge: { w: 11, h: 8 },
  audioMerge: { w: 11, h: 8 },
  universalMerge: { w: 11, h: 8 },
  aiChat: { w: 14, h: 20 },
  imageGen: { w: 14, h: 20 },
  videoGen: { w: 14, h: 23 },
  saveFile: { w: 14, h: 12 },
  output: { w: 13, h: 10 },
};

export function getNodeDefaultSize(type: string, inputCount = 1) {
  const units = NODE_SIZE_UNITS[type] || { w: 10, h: 6 };
  const isMergeNode = ['textMerge', 'imageMerge', 'videoMerge', 'audioMerge', 'universalMerge'].includes(type);
  const heightUnits = isMergeNode ? Math.max(units.h, 7 + inputCount) : units.h;

  return {
    w: units.w * GRID_SIZE,
    h: heightUnits * GRID_SIZE,
  };
}

export const NODE_REGISTRY: NodeTypeDef[] = WORKFLOW_NODE_REGISTRY;

export function getNodeDef(type: string): NodeTypeDef | undefined {
  return getSharedNodeDef(type);
}

export const NODE_CATEGORIES = [
  { id: 'input', label: '输入' },
  { id: 'api', label: 'API' },
  { id: 'merge', label: '合并' },
  { id: 'ai', label: 'AI 能力' },
  { id: 'output', label: '输出' },
] as const;

export const PORT_COMPATIBILITY: Record<string, string[]> = {
  string: ['string', 'any'],
  'string[]': ['string', 'string[]', 'any', 'any[]'],
  image: ['image', 'image[]', 'any'],
  'image[]': ['image', 'image[]', 'any', 'any[]'],
  mask: ['mask', 'any'],
  video: ['video', 'video[]', 'any'],
  'video[]': ['video', 'video[]', 'any', 'any[]'],
  audio: ['audio', 'audio[]', 'any'],
  'audio[]': ['audio', 'audio[]', 'any', 'any[]'],
  apiKey: ['apiKey'],
  any: ['any'],
  'any[]': ['any', 'any[]'],
};

export const DEFAULT_WORKFLOW_NAME = '未命名工作流';

export const APP_VERSION = '0.2.0';
