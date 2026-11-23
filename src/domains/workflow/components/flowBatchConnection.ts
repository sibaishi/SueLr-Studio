import { type Connection, type Edge, type Node, Position } from '@xyflow/react';
import { getExpandedNodeOutputs, getNodeDef } from '../lib/constants';
import { createsCycle } from '../lib/store/editorGraph';
import { isNodeLockedWithAncestors } from '../lib/store/editorShared';
import { canNodeTypesConnect, getInputHandleCandidatesForNode, getInputType } from './flowCanvasConnections';

export const BATCH_OUTPUT_ID = '__selection_output__';

export function selectedOutputNodes(nodes: Node[]) {
  return nodes.filter((node) => node.selected && !node.hidden && node.type !== 'group');
}

/** All-or-nothing planning: never replace a single-input connection or silently skip a selected node. */
export function planBatchConnection(
  nodes: Node[],
  edges: Edge[],
  targetId: string,
  targetHandle: string,
  sourceIds?: string[],
): Connection[] {
  const selected = sourceIds
    ? selectedOutputNodes(nodes.map((node) => ({ ...node, selected: sourceIds.includes(node.id) })))
    : selectedOutputNodes(nodes);
  if (sourceIds && selected.length !== sourceIds.length) return [];
  const target = nodes.find((node) => node.id === targetId);
  if (
    selected.length < 2 ||
    !target ||
    selected.some((node) => node.id === targetId) ||
    isNodeLockedWithAncestors(targetId, nodes) ||
    selected.some((node) => isNodeLockedWithAncestors(node.id, nodes))
  )
    return [];
  const def = getNodeDef(target.type || '');
  if (!def || !getInputType(target, targetHandle)) return [];
  const multi = target.type === 'ai' || target.type === 'io';
  if (!multi && !def.maxInputs) return [];
  const handles = getInputHandleCandidatesForNode(target);
  const occupied = new Set(edges.filter((edge) => edge.target === targetId).map((edge) => edge.targetHandle));
  const available = [targetHandle, ...handles.filter((handle) => handle !== targetHandle)].filter(
    (handle) => !occupied.has(handle),
  );
  const planned: Connection[] = [];
  for (const node of selected) {
    if (createsCycle(nodes, edges, node.id, targetId)) return [];
    const sourceDef = getNodeDef(node.type || '');
    const outputs = sourceDef?.maxOutputs ? getExpandedNodeOutputs(node.type || '', node.data) : sourceDef?.outputs;
    const handle = multi ? targetHandle : available.shift();
    if (!handle) return [];
    const output = outputs?.find((port) => canNodeTypesConnect(port.type, getInputType(target, handle)));
    if (!output) return [];
    if (
      !edges.some(
        (edge) =>
          edge.source === node.id &&
          edge.sourceHandle === output.id &&
          edge.target === targetId &&
          edge.targetHandle === handle,
      )
    ) {
      planned.push({ source: node.id, sourceHandle: output.id, target: targetId, targetHandle: handle });
    }
  }
  return planned;
}

export function batchOutputNode(nodes: Node[]): Node | null {
  const selected = selectedOutputNodes(nodes);
  if (selected.length < 2 || selected.some((node) => isNodeLockedWithAncestors(node.id, nodes))) return null;
  const position = (node: Node, seen = new Set<string>()): { x: number; y: number } => {
    if (!node.parentId || seen.has(node.id)) return node.position;
    seen.add(node.id);
    const parent = nodes.find((item) => item.id === node.parentId);
    const origin = parent ? position(parent, seen) : { x: 0, y: 0 };
    return { x: node.position.x + origin.x, y: node.position.y + origin.y };
  };
  const boxes = selected.map((node) => ({
    ...position(node),
    width: node.measured?.width || node.width || 240,
    height: node.measured?.height || node.height || 240,
  }));
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const padding = 24;
  const width = right - left + padding * 2;
  const height = bottom - top + padding * 2;
  return {
    id: BATCH_OUTPUT_ID,
    type: 'selectionOutput',
    position: { x: left - padding, y: top - padding },
    data: { count: selected.length },
    selectable: false,
    draggable: false,
    deletable: false,
    focusable: false,
    width,
    height,
    // This render-only node's dimension changes are deliberately not persisted.
    // Supply handle bounds explicitly so every controlled render retains drag geometry.
    measured: { width, height },
    handles: [
      {
        id: 'output',
        type: 'source',
        position: Position.Right,
        x: width - 6,
        y: height / 2 - 6,
        width: 12,
        height: 12,
      },
    ],
    style: { width, height, pointerEvents: 'none' },
    zIndex: 1001,
  };
}
