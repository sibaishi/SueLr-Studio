import { PORT_COMPATIBILITY, getExpandedNodeOutputs, getNodeDef } from '@/domains/workflow/lib/constants';
import type { Node as FlowNodeType } from '@xyflow/react';

export function getParentId(node: FlowNodeType | undefined) {
  return (node as (FlowNodeType & { parentId?: string }) | undefined)?.parentId;
}

export function getOutputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return null;

  const def = getNodeDef(node.type || '');
  const outputs = def?.maxOutputs
    ? getExpandedNodeOutputs(node.type || '', (node.data || {}) as Record<string, unknown>)
    : def?.outputs;
  return outputs?.find((port) => port.id === handleId)?.type || null;
}

export function getInputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return null;

  const def = getNodeDef(node.type || '');
  if (!def) return null;
  if (def.maxInputs) return def.inputs[0]?.type || null;
  return def.inputs.find((port) => port.id === handleId)?.type || null;
}

export function getInputHandleCandidatesForNode(node: FlowNodeType) {
  const def = getNodeDef(node.type || '');
  if (!def) return [];
  if (def.maxInputs) return Array.from({ length: def.maxInputs }, (_, index) => `item${index + 1}`);
  return def.inputs.map((input) => input.id);
}

export function canNodeTypesConnect(sourceType: string | null, targetType: string | null) {
  if (!sourceType || !targetType) return false;
  return PORT_COMPATIBILITY[sourceType]?.includes(targetType) ?? false;
}
