import { resolveStylePanelInput } from '@/domains/workflow/components/stylePanelInputResolver';
import { expandAiV3InputSlots } from '@/domains/workflow/lib/store/helpers';
import type { Edge, Node } from '@xyflow/react';

export type MaterialProcessItemType = 'text' | 'image' | 'video' | 'audio';

export type MaterialProcessInputItem = {
  id: string;
  type: MaterialProcessItemType;
  value: string;
  sourceNodeId: string;
};

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    return [String((value as { url: string }).url)];
  }
  return [];
}

export function classifyMaterialProcessValue(value: string): MaterialProcessItemType {
  if (value.startsWith('data:video/') || /\.(mp4|webm|mov|mkv)(?:[?#].*)?$/i.test(value)) return 'video';
  if (value.startsWith('data:audio/') || /\.(mp3|wav|ogg|aac|flac)(?:[?#].*)?$/i.test(value)) return 'audio';
  if (
    value.startsWith('blob:') ||
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/') ||
    /\.(avif|gif|heic|heif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)
  ) {
    return 'image';
  }
  return 'text';
}

export function resolveMaterialProcessInputItems(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  nodeOutputs: Record<string, Record<string, unknown>>,
): MaterialProcessInputItem[] {
  return expandAiV3InputSlots(nodeId, edges, nodes).flatMap((slot) => {
    const sourceNode = nodes.find((node) => node.id === slot.sourceNodeId);
    const sourceData = (sourceNode?.data || {}) as Record<string, unknown>;
    const sourceOutputs = nodeOutputs[slot.sourceNodeId];
    const edge = edges.find((candidate) => candidate.id === slot.edgeId);
    const handle = edge?.sourceHandle || 'output';

    let values: string[] = [];
    if (slot.sourceNodeType !== 'io') {
      values = collectStrings(sourceOutputs?.[handle]);
      if (values.length === 0 && sourceOutputs) {
        values = Object.values(sourceOutputs).flatMap(collectStrings);
      }
      if (values.length === 0) values = collectStrings(sourceData[handle]);
    }

    if (values.length === 0) {
      const resolved = resolveStylePanelInput(slot, nodes, edges, nodeOutputs);
      if (resolved.value) values = [resolved.value];
    }

    return values.map((value, index) => ({
      id: index === 0 ? slot.id : `${slot.id}/${index}`,
      type: classifyMaterialProcessValue(value),
      value,
      sourceNodeId: slot.sourceNodeId,
    }));
  });
}

export function filterMaterialProcessItems(
  items: MaterialProcessInputItem[],
  configuredType: unknown,
): MaterialProcessInputItem[] {
  if (configuredType === 'text' || configuredType === 'image') {
    return items.filter((item) => item.type === configuredType);
  }
  return items.filter((item) => item.type === 'text' || item.type === 'image');
}
