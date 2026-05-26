import { getExpandedNodeOutputs, getNodeDef } from '@/domains/workflow/lib/constants';
import { parseGroupHandleId } from '@/domains/workflow/lib/groupPorts';
import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { getNodeRenderRect } from './flowCanvasClipboard';
import {
  canNodeTypesConnect,
  getInputHandleCandidatesForNode,
  getInputType,
  getOutputType,
  getParentId,
} from './flowCanvasConnections';
import { getEdgeApproximateSegment, pointToSegmentDistance } from './flowCanvasGeometry';
import type { ContextMenuKind, EdgeInsertionCandidate, MenuHorizontalDirection } from './flowCanvasTypes';

export const PORT_TYPE_COLORS: Record<string, string> = {
  string: '#007AFF',
  'string[]': '#007AFF',
  image: '#FF9500',
  'image[]': '#FF9500',
  mask: '#7C4DFF',
  video: '#AF52DE',
  'video[]': '#AF52DE',
  audio: '#FF375F',
  'audio[]': '#FF375F',
  apiKey: '#5856D6',
  any: '#64D2FF',
  'any[]': '#64D2FF',
};

export const DEFAULT_WORKFLOW_EDGE_STYLE = {
  stroke: 'var(--color-text-tertiary)',
  strokeWidth: 2,
} as const;

const GROUP_INTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;

const GROUP_EXTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;

export function isPaneBackgroundTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(
    element.closest('.react-flow__pane') &&
      !element.closest('.react-flow__node') &&
      !element.closest('.react-flow__edge') &&
      !element.closest('.react-flow__selection') &&
      !element.closest('.workflow-context-menu'),
  );
}

export function getNearestGroupAncestorId(nodeId: string, nodeMap: Map<string, FlowNodeType>) {
  let current = nodeMap.get(nodeId);
  while (current) {
    const parentId = getParentId(current);
    if (!parentId) return null;
    const parentNode = nodeMap.get(parentId);
    if (!parentNode) return null;
    if (parentNode.type === 'group') return parentNode.id;
    current = parentNode;
  }

  return null;
}

export function getDecoratedGroupEdge(
  edge: Edge,
  sourceDescriptor: ReturnType<typeof parseGroupHandleId>,
  targetDescriptor: ReturnType<typeof parseGroupHandleId>,
): Edge {
  const isInternal =
    sourceDescriptor?.role === 'internal' ||
    targetDescriptor?.role === 'internal' ||
    edge.id.startsWith('group-binding:');
  const isExternal =
    sourceDescriptor?.role === 'external' || targetDescriptor?.role === 'external' || edge.id.startsWith('virtual:');

  if (isInternal) {
    return {
      ...edge,
      style: {
        ...(edge.style || {}),
        ...GROUP_INTERNAL_EDGE_STYLE,
      },
    };
  }

  if (isExternal) {
    return {
      ...edge,
      style: {
        ...(edge.style || {}),
        ...GROUP_EXTERNAL_EDGE_STYLE,
      },
    };
  }

  return edge;
}

function resolveNodeBridgeHandles(node: FlowNodeType, edge: Edge, nodeMap: Map<string, FlowNodeType>, edges: Edge[]) {
  if (node.type === 'group') return null;
  if (edge.source === node.id || edge.target === node.id) return null;
  if (!edge.sourceHandle || !edge.targetHandle) return null;
  if (parseGroupHandleId(edge.sourceHandle) || parseGroupHandleId(edge.targetHandle)) return null;

  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  const sourceType = getOutputType(sourceNode, edge.sourceHandle);
  const targetType = getInputType(targetNode, edge.targetHandle);
  const def = getNodeDef(node.type || '');
  if (!sourceType || !targetType || !def) return null;

  const occupiedTargetHandles = new Set(
    edges
      .filter((item) => item.id !== edge.id && item.targetHandle)
      .map((item) => `${item.target}:${item.targetHandle}`),
  );
  const inputHandle = getInputHandleCandidatesForNode(node).find((handleId) => {
    const inputType = def.maxInputs ? def.inputs[0]?.type : def.inputs.find((input) => input.id === handleId)?.type;
    return Boolean(
      inputType && !occupiedTargetHandles.has(`${node.id}:${handleId}`) && canNodeTypesConnect(sourceType, inputType),
    );
  });
  const outputs = def.maxOutputs
    ? getExpandedNodeOutputs(node.type || '', (node.data || {}) as Record<string, unknown>)
    : def.outputs;
  const outputHandle = outputs.find((output) => canNodeTypesConnect(output.type, targetType))?.id;

  return inputHandle && outputHandle ? { inputHandle, outputHandle } : null;
}

function canNodeBridgeEdge(node: FlowNodeType, edge: Edge, nodeMap: Map<string, FlowNodeType>, edges: Edge[]) {
  return Boolean(resolveNodeBridgeHandles(node, edge, nodeMap, edges));
}

export function getEdgeDataTypeColor(edge: Edge, nodeMap: Map<string, FlowNodeType>) {
  const sourceType = getOutputType(nodeMap.get(edge.source), edge.sourceHandle);
  const targetType = getInputType(nodeMap.get(edge.target), edge.targetHandle);
  return PORT_TYPE_COLORS[sourceType || ''] || PORT_TYPE_COLORS[targetType || ''] || 'var(--color-accent)';
}

export function findEdgeInsertionCandidate(draggedNode: FlowNodeType, nodes: FlowNodeType[], edges: Edge[]) {
  if (draggedNode.type === 'group' || getParentId(draggedNode)) return null;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  nodeMap.set(draggedNode.id, draggedNode);
  const draggedRect = getNodeRenderRect(draggedNode, nodeMap);
  const draggedCenter = {
    x: draggedRect.x + draggedRect.width / 2,
    y: draggedRect.y + draggedRect.height / 2,
  };
  const threshold = Math.max(36, Math.min(draggedRect.width, draggedRect.height) * 0.45);

  let bestEdge: Edge | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const edge of edges) {
    if (edge.id.startsWith('virtual:') || edge.id.startsWith('group-binding:')) continue;
    if (!canNodeBridgeEdge(draggedNode, edge, nodeMap, edges)) continue;

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const segment = getEdgeApproximateSegment(edge, nodeMap);
    if (!segment) continue;
    const distance = pointToSegmentDistance(draggedCenter, segment.start, segment.end);
    if (distance < threshold && distance < bestDistance) {
      bestEdge = edge;
      bestDistance = distance;
    }
  }

  return bestEdge;
}

export function buildEdgeInsertionPreviewEdges(
  candidate: EdgeInsertionCandidate | null,
  nodes: FlowNodeType[],
  edges: Edge[],
) {
  if (!candidate) return [];

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  nodeMap.set(candidate.node.id, candidate.node);
  const sourceEdge = edges.find((edge) => edge.id === candidate.edgeId);
  if (!sourceEdge) return [];

  const handles = resolveNodeBridgeHandles(candidate.node, sourceEdge, nodeMap, edges);
  if (!handles || !sourceEdge.sourceHandle || !sourceEdge.targetHandle) return [];
  const typeColor = getEdgeDataTypeColor(sourceEdge, nodeMap);

  const common = {
    type: 'default',
    animated: false,
    selectable: false,
    deletable: false,
    focusable: false,
    className: 'workflow-edge-insertion-preview',
    style: {
      stroke: typeColor,
      strokeWidth: 5,
      '--workflow-edge-preview-color': typeColor,
    } as CSSProperties,
  } satisfies Partial<Edge>;

  return [
    {
      ...common,
      id: `insertion-preview:${sourceEdge.id}:in`,
      source: sourceEdge.source,
      sourceHandle: sourceEdge.sourceHandle,
      target: candidate.node.id,
      targetHandle: handles.inputHandle,
    },
    {
      ...common,
      id: `insertion-preview:${sourceEdge.id}:out`,
      source: candidate.node.id,
      sourceHandle: handles.outputHandle,
      target: sourceEdge.target,
      targetHandle: sourceEdge.targetHandle,
    },
  ] as Edge[];
}

export function getLocalPoint(event: MouseEvent | TouchEvent | ReactMouseEvent, container: HTMLDivElement | null) {
  const rect = container?.getBoundingClientRect();
  const touch = 'touches' in event ? event.touches[0] || event.changedTouches[0] : null;
  const clientX = touch ? touch.clientX : 'clientX' in event ? event.clientX : 0;
  const clientY = touch ? touch.clientY : 'clientY' in event ? event.clientY : 0;

  return {
    clientX,
    clientY,
    localX: rect ? clientX - rect.left + 6 : clientX,
    localY: rect ? clientY - rect.top + 6 : clientY,
  };
}

export function getContextMenuLayout(
  kind: ContextMenuKind,
  container: HTMLDivElement | null,
  localX: number,
  localY: number,
): { x: number; y: number; horizontalDirection: MenuHorizontalDirection } {
  const rect = container?.getBoundingClientRect();
  const menuWidth = kind === 'node' ? 220 : 328;
  const menuHeight = kind === 'node' ? 288 : 360;
  const maxX = rect ? Math.max(8, rect.width - menuWidth - 8) : localX;
  const maxY = rect ? Math.max(8, rect.height - menuHeight - 8) : localY;

  return {
    x: Math.min(Math.max(8, localX), maxX),
    y: Math.min(Math.max(8, localY), maxY),
    horizontalDirection: rect && localX > rect.width / 2 ? 'left' : 'right',
  };
}
