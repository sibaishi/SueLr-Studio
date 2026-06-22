import { fileRawStore } from '@/domains/workflow/components/nodes/io/fileRawStore';
import type { AiV3InputSlot } from '@/domains/workflow/lib/store/helpers';
import type { Edge, Node } from '@xyflow/react';

export type ResolvedStylePanelInput = {
  sourceNode?: Node;
  type: AiV3InputSlot['type'];
  value: string;
};

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap(collectStringValues);
}

function resolveIoValue(slot: AiV3InputSlot, data: Record<string, unknown>): string {
  const content = Array.isArray(data.content) ? (data.content as string[]) : [];

  if (slot.type === 'text') {
    const text = String(data.text || '');
    if (text) return text;
    return (
      content.find((item) => {
        const value = String(item);
        return Boolean(value.trim()) && !/^(https?:\/\/|\/api\/|data:|blob:)/.test(value);
      }) || ''
    );
  }

  if (slot.fileId !== undefined) {
    const fileIds = Array.isArray(data._fileIds) ? (data._fileIds as number[]) : [];
    const contentIndex = fileIds.indexOf(slot.fileId);
    return fileRawStore.getObjectUrl(slot.fileId) || (contentIndex >= 0 ? content[contentIndex] : '') || '';
  }

  return slot.fileIdx === undefined ? '' : content[slot.fileIdx] || '';
}

function resolveStandardValue(
  slot: AiV3InputSlot,
  data: Record<string, unknown>,
  outputs: Record<string, unknown> | undefined,
  edges: Edge[],
): string {
  const edge = edges.find((candidate) => candidate.id === slot.edgeId);
  const handle = edge?.sourceHandle || 'output';
  const directValue = data[handle];
  if (typeof directValue === 'string' && directValue) return directValue;

  for (const key of ['text', 'image', 'video', 'audio', 'value', 'fileUrl']) {
    const value = data[key];
    if (typeof value === 'string' && value) return value;
  }

  if (!outputs) return '';
  const handleValues = collectStringValues(outputs[handle]);
  if (handleValues.length > 0) return handleValues[handleValues.length - 1];

  for (const value of Object.values(outputs)) {
    const values = collectStringValues(value);
    if (values.length > 0) return values[0];
  }
  return '';
}

export function inferStylePanelInputType(type: AiV3InputSlot['type'], value: string): AiV3InputSlot['type'] {
  if (type !== 'text' || !value) return type;
  if (value.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(value)) return 'video';
  if (value.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(value)) return 'audio';
  if (
    value.startsWith('blob:') ||
    value.startsWith('data:image/') ||
    value.startsWith('http') ||
    value.startsWith('/api/')
  ) {
    return 'image';
  }
  return type;
}

export function resolveStylePanelInput(
  slot: AiV3InputSlot,
  nodes: Node[],
  edges: Edge[],
  nodeOutputs: Record<string, Record<string, unknown>>,
): ResolvedStylePanelInput {
  const sourceNode = nodes.find((node) => node.id === slot.sourceNodeId);
  const data = (sourceNode?.data || {}) as Record<string, unknown>;
  const value =
    slot.sourceNodeType === 'io'
      ? resolveIoValue(slot, data)
      : resolveStandardValue(slot, data, nodeOutputs[slot.sourceNodeId], edges);

  return {
    sourceNode,
    value,
    type: inferStylePanelInputType(slot.type, value),
  };
}
