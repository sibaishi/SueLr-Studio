import type { NodeTypeDef } from './types';
import { NODE_REGISTRY as WORKFLOW_NODE_DEFS, getNodeDef as getSharedNodeDef } from '@/features/workflow/nodes/registry';

export const GRID_SIZE = 28;
const VARIABLE_INPUT_MERGE_TYPES = new Set(['iterateRun', 'iterateImageRun', 'textMerge', 'imageMerge', 'videoMerge', 'audioMerge']);
const DEFAULT_NODE_SIZE_UNITS = { w: 10, h: 6 };

export const NODE_SIZE_UNITS: Record<string, { w: number; h: number }> = {
  group: { w: 14, h: 10 },
  textInput: { w: 12, h: 9 },
  imageInput: { w: 13, h: 13 },
  maskInput: { w: 13, h: 14 },
  imageResize: { w: 14, h: 12 },
  imageCompare: { w: 16, h: 14 },
  videoInput: { w: 13, h: 11 },
  audioInput: { w: 13, h: 9 },
  apiKeyInput: { w: 14, h: 21 },
  iterateRun: { w: 11, h: 8 },
  iterateImageRun: { w: 11, h: 8 },
  promptHelper: { w: 14, h: 12 },
  textClean: { w: 12, h: 14 },
  textSplit: { w: 12, h: 23 },
  textMerge: { w: 11, h: 8 },
  imageMerge: { w: 11, h: 8 },
  videoMerge: { w: 11, h: 8 },
  audioMerge: { w: 11, h: 8 },
  aiChat: { w: 14, h: 20 },
  imageGen: { w: 14, h: 20 },
  videoGen: { w: 14, h: 23 },
  saveFile: { w: 14, h: 12 },
  output: { w: 13, h: 10 },
};

function getVariablePortCount(type: string, inputCount: number) {
  if (VARIABLE_INPUT_MERGE_TYPES.has(type)) return inputCount;
  return 1;
}

function getNodeSizeUnits(type: string) {
  return NODE_SIZE_UNITS[type] || DEFAULT_NODE_SIZE_UNITS;
}

export function getNodeDef(type: string): NodeTypeDef | undefined {
  return getSharedNodeDef(type);
}

export function getNodeInputCount(type: string, data?: Record<string, unknown>) {
  const def = getNodeDef(type);
  if (!def?.maxInputs) return def?.inputs.length || 0;
  const rawCount = Number(data?.inputCount);
  const normalized = Number.isFinite(rawCount) ? Math.trunc(rawCount) : 1;
  return Math.max(1, Math.min(def.maxInputs, normalized));
}

export function getNodeOutputCount(type: string, data?: Record<string, unknown>) {
  const def = getNodeDef(type);
  if (!def?.maxOutputs) return def?.outputs.length || 0;
  const outputCountParam = def.params.find((param) => param.id === 'outputCount');
  const fallback = typeof outputCountParam?.default === 'number' ? outputCountParam.default : 2;
  const rawCount = Number(data?.outputCount);
  const normalized = Number.isFinite(rawCount) ? Math.trunc(rawCount) : fallback;
  return Math.max(1, Math.min(def.maxOutputs, normalized));
}

export function getExpandedNodeOutputs(type: string, data?: Record<string, unknown>) {
  const def = getNodeDef(type);
  if (!def) return [];
  if (!def.maxOutputs) return def.outputs;

  const template = def.outputs[0];
  if (!template) return [];

  return Array.from({ length: getNodeOutputCount(type, data) }, (_, index) => ({
    ...template,
    id: `part${index + 1}`,
    label: `片段${index + 1}`,
  }));
}

export function getNodeDefaultSize(type: string, inputCount = 1) {
  const units = getNodeSizeUnits(type);
  const variablePortCount = getVariablePortCount(type, inputCount);
  const heightUnits = variablePortCount > 1 ? Math.max(units.h, 7 + variablePortCount) : units.h;
  return {
    w: units.w * GRID_SIZE,
    h: heightUnits * GRID_SIZE,
  };
}

export function getNodeAutoExpandedSize(
  type: string,
  inputCount = getNodeInputCount(type),
  outputCount = getNodeOutputCount(type),
) {
  void outputCount;
  const units = getNodeSizeUnits(type);
  const variablePortCount = getVariablePortCount(type, inputCount);
  const heightUnits = variablePortCount > 1 ? Math.max(units.h, 7 + variablePortCount) : units.h;

  return {
    w: units.w * GRID_SIZE,
    h: heightUnits * GRID_SIZE,
  };
}

export const NODE_REGISTRY: NodeTypeDef[] = WORKFLOW_NODE_DEFS;

export const NODE_CATEGORIES = [
  { id: 'input', label: '输入' },
  { id: 'api', label: 'API' },
  { id: 'merge', label: '合并' },
  { id: 'iterate', label: '逐项运行' },
  { id: 'tool', label: '工具' },
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
