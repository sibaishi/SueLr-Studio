import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type CoordinateExtent,
  type Edge,
  type EdgeChange,
  type EdgeMouseHandler,
  type Node as FlowNodeType,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react';
import {
  getNodeDef,
  getNodeDefaultSize,
  GRID_SIZE,
  NODE_REGISTRY,
  PORT_COMPATIBILITY,
} from '@/features/workflow/lib/constants';
import { uploadFile } from '@/features/workflow/lib/api';
import {
  buildGroupHandleId,
  collectDescendantNodeIds,
  findGroupPort,
  getGroupPorts,
  isGroupPortExternallyConnectable,
  parseGroupHandleId,
} from '@/features/workflow/lib/groupPorts';
import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  getCollapsedGroupNodeSize,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/features/workflow/lib/store/editorShared';
import { useWorkflowCanvasStore } from '@/features/workflow/lib/store/selectors';
import { NodeCanvasEditorModal } from './NodeCanvasEditorModal';
import { NODE_ICONS } from './nodes/nodeConstants';
import FlowNode from './nodes/FlowNode';
import './contextMenu.css';

const nodeTypes = {
  group: FlowNode,
  textInput: FlowNode,
  imageInput: FlowNode,
  maskInput: FlowNode,
  imageResize: FlowNode,
  videoInput: FlowNode,
  audioInput: FlowNode,
  apiKeyInput: FlowNode,
  textSplit: FlowNode,
  textMerge: FlowNode,
  imageMerge: FlowNode,
  videoMerge: FlowNode,
  audioMerge: FlowNode,
  universalMerge: FlowNode,
  aiChat: FlowNode,
  imageGen: FlowNode,
  videoGen: FlowNode,
  saveFile: FlowNode,
  output: FlowNode,
};

const NODE_COLORS: Record<string, string> = {
  group: '#8E8E93',
  textInput: '#007AFF',
  imageInput: '#FF9500',
  maskInput: '#7C4DFF',
  imageResize: '#FF9F0A',
  videoInput: '#AF52DE',
  audioInput: '#FF375F',
  apiKeyInput: '#5856D6',
  textSplit: '#0A84FF',
  textMerge: '#007AFF',
  imageMerge: '#FF9500',
  videoMerge: '#AF52DE',
  audioMerge: '#FF375F',
  universalMerge: '#64D2FF',
  aiChat: '#30D158',
  imageGen: '#FF9500',
  videoGen: '#AF52DE',
  saveFile: '#34C759',
  output: '#8E8E93',
};
const PORT_TYPE_COLORS: Record<string, string> = {
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

const CATEGORY_LABELS = {
  group: '节点组',
  input: '输入',
  api: 'API',
  merge: '工具',
  ai: 'AI 能力',
  output: '输出',
} as const;

const CATEGORY_ORDER = ['input', 'api', 'merge', 'ai', 'output', 'group'] as const;
const DISABLED_NEW_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge', 'universalMerge']);
const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);
const DISABLED_NODE_REASON = '暂时停用，无法新建';
const DEFAULT_WORKFLOW_EDGE_STYLE = {
  stroke: 'var(--color-text-tertiary)',
  strokeWidth: 2,
} as const;
const GROUP_INTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;
const GROUP_EXTERNAL_EDGE_STYLE = {
  ...DEFAULT_WORKFLOW_EDGE_STYLE,
} as const;
const EDGE_CUT_DISTANCE = 14;

function formatCanvasUploadError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `上传没有完成，请检查文件格式、大小或稍后重试。${detail}`
    : '上传没有完成，请检查文件格式、大小或稍后重试。';
}

function isEditableElement(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
}

type ClipboardSnapshot = {
  nodes: FlowNodeType[];
  edges: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }[];
  bounds: {
    minX: number;
    minY: number;
  };
};

type PendingConnection =
  | {
      allowCreateNode: boolean;
      handleType: 'source';
      sourceId: string;
      sourceHandle: string;
      sourceType: string;
    }
  | {
      allowCreateNode: boolean;
      handleType: 'target';
      targetId: string;
      targetHandle: string;
      targetType: string;
    };

type ContextMenuKind = 'pane' | 'paneActions' | 'node' | 'connect';
type MenuHorizontalDirection = 'left' | 'right';
type EdgeInsertionCandidate = {
  edgeId: string;
  node: FlowNodeType;
};

type ContextMenuState = {
  kind: ContextMenuKind;
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  horizontalDirection: MenuHorizontalDirection;
  nodeId?: string;
  selectedNodeIds?: string[];
  sourceConnection?: PendingConnection;
};

interface FlowCanvasProps {
  onViewportCenterChange?: (position: { x: number; y: number }) => void;
}

function buildDefaultData(nodeType: string) {
  const def = getNodeDef(nodeType);
  if (!def) return {};

  const defaultData: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      defaultData[param.id] = param.default;
    }
  }
  if (def.maxInputs) {
    defaultData.inputCount = 1;
  }
  return defaultData;
}

function getDefaultNodeSize(nodeType: string) {
  return getNodeDefaultSize(nodeType);
}

function getCenteredPosition(nodeType: string, flowPosition: { x: number; y: number }) {
  const size = getDefaultNodeSize(nodeType);
  return {
    x: flowPosition.x - size.w / 2,
    y: flowPosition.y - size.h / 2,
  };
}

function getDroppedFileNodeType(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith('image/')) return 'imageInput';
  if (mime.startsWith('video/')) return 'videoInput';
  if (mime.startsWith('audio/')) return 'audioInput';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i.test(name)
  ) {
    return 'textInput';
  }

  return null;
}

function getDropNodePosition(
  nodeType: string,
  flowPosition: { x: number; y: number },
  index: number,
) {
  const base = getCenteredPosition(nodeType, flowPosition);
  return {
    x: base.x + index * 28,
    y: base.y + index * 28,
  };
}

function snapValue(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getAbsoluteNodePosition(nodeId: string, nodeMap: Map<string, FlowNodeType>, memo = new Map<string, { x: number; y: number }>()) {
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodeMap.get(nodeId);
  if (!node) {
    const fallback = { x: 0, y: 0 };
    memo.set(nodeId, fallback);
    return fallback;
  }

  let position = { x: node.position.x, y: node.position.y };
  const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
  if (parentId && nodeMap.has(parentId)) {
    const parentPosition = getAbsoluteNodePosition(parentId, nodeMap, memo);
    position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
  }

  memo.set(nodeId, position);
  return position;
}

function getDescendantIds(nodes: FlowNodeType[], rootIds: string[]) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
    if (!parentId) continue;
    const current = byParent.get(parentId) || [];
    current.push(node.id);
    byParent.set(parentId, current);
  }

  const visited = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    for (const childId of byParent.get(currentId) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return [...visited];
}

function expandSelectionIds(nodes: FlowNodeType[], nodeIds: string[]) {
  const uniqueIds = [...new Set(nodeIds)];
  return [...new Set([...uniqueIds, ...getDescendantIds(nodes, uniqueIds)])];
}

function getParentId(node: FlowNodeType | undefined) {
  return (node as FlowNodeType & { parentId?: string } | undefined)?.parentId;
}

function getGroupPortType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || node.type !== 'group') return null;
  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor) return null;
  return findGroupPort((node.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId)?.type || null;
}

function getOutputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return getGroupPortType(node, handleId);

  const def = getNodeDef(node.type || '');
  return def?.outputs.find((port) => port.id === handleId)?.type || null;
}

function getInputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return getGroupPortType(node, handleId);

  const def = getNodeDef(node.type || '');
  if (!def) return null;
  if (def.maxInputs) return def.inputs[0]?.type || null;
  return def.inputs.find((port) => port.id === handleId)?.type || null;
}

function canConnectToGroupHandleExternally(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || node.type !== 'group' || !handleId) return false;
  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor) return false;
  const port = findGroupPort((node.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId);
  return port ? isGroupPortExternallyConnectable(port) : false;
}

function isNodeInsideGroup(node: FlowNodeType | undefined, groupId: string, nodeMap: Map<string, FlowNodeType>) {
  let current = node;
  while (current) {
    const parentId = getParentId(current);
    if (!parentId) return false;
    if (parentId === groupId) return true;
    current = nodeMap.get(parentId);
  }

  return false;
}

function resolveDirectionalGroupConnection(
  connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
  nodeMap: Map<string, FlowNodeType>,
) {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return null;

  const sourceNode = nodeMap.get(connection.source);
  const targetNode = nodeMap.get(connection.target);
  if (!sourceNode || !targetNode) return null;

  const sourceDescriptor = parseGroupHandleId(connection.sourceHandle);
  const targetDescriptor = parseGroupHandleId(connection.targetHandle);
  let sourceHandle = connection.sourceHandle;
  let targetHandle = connection.targetHandle;

  if (sourceDescriptor) {
    if (sourceNode.type !== 'group') return null;
    const targetIsInsideSourceGroup = isNodeInsideGroup(targetNode, sourceNode.id, nodeMap);
    const nextRole = targetIsInsideSourceGroup ? 'internal' : 'external';

    if (targetIsInsideSourceGroup) {
      if (sourceDescriptor.side !== 'input') return null;
    } else if (sourceDescriptor.side !== 'output') {
      return null;
    }

    sourceHandle = buildGroupHandleId(sourceDescriptor.side, sourceDescriptor.portId, nextRole);
  }

  if (targetDescriptor) {
    if (targetNode.type !== 'group') return null;
    const sourceIsInsideTargetGroup = isNodeInsideGroup(sourceNode, targetNode.id, nodeMap);
    const nextRole = sourceIsInsideTargetGroup ? 'internal' : 'external';

    if (sourceIsInsideTargetGroup) {
      if (targetDescriptor.side !== 'output') return null;
    } else if (targetDescriptor.side !== 'input') {
      return null;
    }

    targetHandle = buildGroupHandleId(targetDescriptor.side, targetDescriptor.portId, nextRole);
  }

  return {
    source: connection.source,
    sourceHandle,
    target: connection.target,
    targetHandle,
  };
}

function getVisibleCollapsedAncestorId(
  nodeId: string,
  nodeMap: Map<string, FlowNodeType>,
  collapsedGroupIds: Set<string>,
) {
  let current = nodeMap.get(nodeId);
  let visibleCollapsedId: string | null = null;

  while (current) {
    if (collapsedGroupIds.has(current.id)) {
      visibleCollapsedId = current.id;
    }
    const parentId = getParentId(current);
    current = parentId ? nodeMap.get(parentId) : undefined;
  }

  return visibleCollapsedId;
}

function isPaneBackgroundTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(
    element.closest('.react-flow__pane')
    && !element.closest('.react-flow__node')
    && !element.closest('.react-flow__edge')
    && !element.closest('.react-flow__selection')
    && !element.closest('.workflow-context-menu'),
  );
}

function getNearestGroupAncestorId(nodeId: string, nodeMap: Map<string, FlowNodeType>) {
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

function getDecoratedGroupEdge(
  edge: Edge,
  sourceDescriptor: ReturnType<typeof parseGroupHandleId>,
  targetDescriptor: ReturnType<typeof parseGroupHandleId>,
): Edge {
  const isInternal = sourceDescriptor?.role === 'internal' || targetDescriptor?.role === 'internal' || edge.id.startsWith('group-binding:');
  const isExternal = sourceDescriptor?.role === 'external' || targetDescriptor?.role === 'external' || edge.id.startsWith('virtual:');

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

function buildClipboardSnapshot(nodes: FlowNodeType[], edges: Edge[], nodeIds: string[]): ClipboardSnapshot | null {
  const expandedIds = expandSelectionIds(nodes, nodeIds);
  if (expandedIds.length === 0) return null;

  const selectedSet = new Set(expandedIds);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  const snapshotNodes = nodes
    .filter((node) => selectedSet.has(node.id))
    .map((node) => {
      const absolutePosition = getAbsoluteNodePosition(node.id, nodeMap, positionMemo);
      const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
      const nextPosition = parentId && selectedSet.has(parentId)
        ? { ...node.position }
        : absolutePosition;
      minX = Math.min(minX, absolutePosition.x);
      minY = Math.min(minY, absolutePosition.y);
      return {
        ...node,
        position: nextPosition,
        parentId,
      } as FlowNodeType;
    });

  if (snapshotNodes.length === 0) return null;

  return {
    nodes: snapshotNodes,
    edges: edges
      .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
      })),
    bounds: {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
    },
  };
}

function snapNodeBox(node: FlowNodeType): FlowNodeType {
  const nodeType = node.type || '';
  const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
  const minSize = getNodeDefaultSize(nodeType, inputCount);
  const currentWidth = typeof node.width === 'number' ? node.width : minSize.w;
  const currentHeight = typeof node.height === 'number' ? node.height : minSize.h;
  const width = Math.max(minSize.w, snapValue(currentWidth));
  const height = Math.max(minSize.h, snapValue(currentHeight));

  return {
    ...node,
    position: {
      x: snapValue(node.position.x),
      y: snapValue(node.position.y),
    },
    width,
    height,
  };
}

function getNodeRenderRect(node: FlowNodeType, nodeMap: Map<string, FlowNodeType>) {
  const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
  const fallbackSize = getNodeDefaultSize(node.type || '', inputCount);
  const style = (node.style || {}) as Record<string, unknown>;
  const width = typeof node.width === 'number'
    ? node.width
    : typeof style.width === 'number' ? style.width : fallbackSize.w;
  const height = typeof node.height === 'number'
    ? node.height
    : typeof style.height === 'number' ? style.height : fallbackSize.h;
  const position = getAbsoluteNodePosition(node.id, nodeMap);

  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function getOrientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function isPointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return (
    point.x <= Math.max(start.x, end.x)
    && point.x >= Math.min(start.x, end.x)
    && point.y <= Math.max(start.y, end.y)
    && point.y >= Math.min(start.y, end.y)
  );
}

function doSegmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  const o1 = getOrientation(a1, a2, b1);
  const o2 = getOrientation(a1, a2, b2);
  const o3 = getOrientation(b1, b2, a1);
  const o4 = getOrientation(b1, b2, a2);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  if (o1 === 0 && isPointOnSegment(b1, a1, a2)) return true;
  if (o2 === 0 && isPointOnSegment(b2, a1, a2)) return true;
  if (o3 === 0 && isPointOnSegment(a1, b1, b2)) return true;
  if (o4 === 0 && isPointOnSegment(a2, b1, b2)) return true;
  return false;
}

function segmentToSegmentDistance(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  if (doSegmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentDistance(a1, b1, b2),
    pointToSegmentDistance(a2, b1, b2),
    pointToSegmentDistance(b1, a1, a2),
    pointToSegmentDistance(b2, a1, a2),
  );
}

function getEdgeApproximateSegment(
  edge: Edge,
  nodeMap: Map<string, FlowNodeType>,
) {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  if (!sourceNode || !targetNode) return null;

  const sourceRect = getNodeRenderRect(sourceNode, nodeMap);
  const targetRect = getNodeRenderRect(targetNode, nodeMap);

  return {
    start: { x: sourceRect.x + sourceRect.width, y: sourceRect.y + sourceRect.height / 2 },
    end: { x: targetRect.x, y: targetRect.y + targetRect.height / 2 },
  };
}

function findCuttableEdgesAlongSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  nodes: FlowNodeType[],
  edges: Edge[],
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.filter((edge) => {
    const segment = getEdgeApproximateSegment(edge, nodeMap);
    if (!segment) return false;

    return segmentToSegmentDistance(start, end, segment.start, segment.end) <= EDGE_CUT_DISTANCE;
  });
}

function getInputHandleCandidatesForNode(node: FlowNodeType) {
  const def = getNodeDef(node.type || '');
  if (!def) return [];
  if (def.maxInputs) return Array.from({ length: def.maxInputs }, (_, index) => `item${index + 1}`);
  return def.inputs.map((input) => input.id);
}

function resolveNodeBridgeHandles(
  node: FlowNodeType,
  edge: Edge,
  nodeMap: Map<string, FlowNodeType>,
  edges: Edge[],
) {
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
    const inputType = def.maxInputs
      ? def.inputs[0]?.type
      : def.inputs.find((input) => input.id === handleId)?.type;
    return Boolean(
      inputType
      && !occupiedTargetHandles.has(`${node.id}:${handleId}`)
      && PORT_COMPATIBILITY[sourceType]?.includes(inputType),
    );
  });
  const outputHandle = def.outputs.find((output) => (
    PORT_COMPATIBILITY[output.type]?.includes(targetType) ?? false
  ))?.id;

  return inputHandle && outputHandle ? { inputHandle, outputHandle } : null;
}

function canNodeBridgeEdge(
  node: FlowNodeType,
  edge: Edge,
  nodeMap: Map<string, FlowNodeType>,
  edges: Edge[],
) {
  return Boolean(resolveNodeBridgeHandles(node, edge, nodeMap, edges));
}

function getEdgeDataTypeColor(edge: Edge, nodeMap: Map<string, FlowNodeType>) {
  const sourceType = getOutputType(nodeMap.get(edge.source), edge.sourceHandle);
  const targetType = getInputType(nodeMap.get(edge.target), edge.targetHandle);
  return PORT_TYPE_COLORS[sourceType || ''] || PORT_TYPE_COLORS[targetType || ''] || 'var(--color-accent)';
}

function findEdgeInsertionCandidate(
  draggedNode: FlowNodeType,
  nodes: FlowNodeType[],
  edges: Edge[],
) {
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

function buildEdgeInsertionPreviewEdges(
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

function getLocalPoint(
  event: MouseEvent | TouchEvent | ReactMouseEvent,
  container: HTMLDivElement | null,
) {
  const rect = container?.getBoundingClientRect();
  const touch = 'touches' in event ? event.touches[0] || event.changedTouches[0] : null;
  const clientX = touch ? touch.clientX : ('clientX' in event ? event.clientX : 0);
  const clientY = touch ? touch.clientY : ('clientY' in event ? event.clientY : 0);

  return {
    clientX,
    clientY,
    localX: rect ? clientX - rect.left + 6 : clientX,
    localY: rect ? clientY - rect.top + 6 : clientY,
  };
}

function getContextMenuLayout(
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

function FlowCanvasInner({ onViewportCenterChange }: FlowCanvasProps) {
  const store = useWorkflowCanvasStore();
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_ORDER)[number] | null>(null);
  const [clipboardNode, setClipboardNode] = useState<ClipboardSnapshot | null>(null);
  const [canvasEditorNodeId, setCanvasEditorNodeId] = useState<string | null>(null);
  const [edgeInsertionCandidate, setEdgeInsertionCandidate] = useState<EdgeInsertionCandidate | null>(null);
  const [edgeCuttingActive, setEdgeCuttingActive] = useState(false);
  const pendingConnectionRef = useRef<PendingConnection | null>(null);
  const contextMenuOpenedAtRef = useRef(0);
  const lastPointerFlowPositionRef = useRef<{ x: number; y: number } | null>(null);
  const edgeCutPreviousPointRef = useRef<{ x: number; y: number } | null>(null);
  const edgeCutRemovedIdsRef = useRef<Set<string>>(new Set());

  const wasContextMenuJustOpened = useCallback(() => Date.now() - contextMenuOpenedAtRef.current < 150, []);

  const reportViewportCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    onViewportCenterChange?.(reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }));
  }, [onViewportCenterChange, reactFlow]);

  useEffect(() => {
    reportViewportCenter();
    window.addEventListener('resize', reportViewportCenter);
    return () => window.removeEventListener('resize', reportViewportCenter);
  }, [reportViewportCenter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodeIds = store.nodes.filter((node) => node.selected).map((node) => node.id);
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          store.removeNodes(selectedNodeIds);
          return;
        }
      }

      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };

    const handleBlur = () => setSpaceHeld(false);

    const closeMenuOnWindowClick = () => {
      if (wasContextMenuJustOpened()) return;
      setContextMenu(null);
      setActiveCategory(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('click', closeMenuOnWindowClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('click', closeMenuOnWindowClick);
    };
  }, [store, wasContextMenuJustOpened]);

  const renderModel = useMemo(() => {
    const collapsedGroups = store.nodes.filter((node) => node.type === 'group' && node.data?.collapsed);
    const collapsedGroupIds = new Set(collapsedGroups.map((node) => node.id));
    const collapsedDescendantIds = new Set<string>();

    for (const group of collapsedGroups) {
      for (const nodeId of collectDescendantNodeIds(store.nodes, group.id)) {
        collapsedDescendantIds.add(nodeId);
      }
    }

    const nodeMap = new Map(store.nodes.map((node) => [node.id, node as FlowNodeType]));
    const visibleNodes = store.nodes
      .filter((node) => !collapsedDescendantIds.has(node.id))
      .map((node) => {
        const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
        const size = getNodeDefaultSize(node.type || '', inputCount);
        const collapsedSize = node.type === 'group' && node.data?.collapsed
          ? getCollapsedGroupNodeSize(node as FlowNodeType)
          : null;
        const width = collapsedSize
          ? collapsedSize.width
          : typeof node.width === 'number' ? Math.max(node.width, size.w) : size.w;
        const height = collapsedSize
          ? collapsedSize.height
          : typeof node.height === 'number' ? Math.max(node.height, size.h) : size.h;

        return {
          ...node,
          zIndex: node.type === 'group' ? 0 : 1,
          style: {
            ...(node.style || {}),
            width,
            height,
            minWidth: size.w,
            minHeight: size.h,
          },
        } as FlowNodeType;
      })
      .sort((a, b) => {
        const aParent = Boolean((a as FlowNodeType & { parentId?: string }).parentId);
        const bParent = Boolean((b as FlowNodeType & { parentId?: string }).parentId);
        if (aParent !== bParent) return aParent ? 1 : -1;
        if ((a.type === 'group') !== (b.type === 'group')) return a.type === 'group' ? -1 : 1;
        return 0;
      });

    const visibleEdges: Edge[] = [];
    const virtualEdges: Edge[] = [];
    const internalPortEdges: Edge[] = [];
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    for (const node of visibleNodes) {
      if (node.type !== 'group' || collapsedGroupIds.has(node.id)) continue;

      const nodeData = (node.data || {}) as Record<string, unknown>;
      for (const port of getGroupPorts(nodeData, 'input')) {
        for (const insideLink of port.insideLinks) {
          if (!visibleNodeIds.has(insideLink.nodeId)) continue;
          internalPortEdges.push({
            id: `group-binding:${node.id}:input:${port.id}:${insideLink.nodeId}:${insideLink.handleId}`,
            source: node.id,
            sourceHandle: buildGroupHandleId('input', port.id, 'internal'),
            target: insideLink.nodeId,
            targetHandle: insideLink.handleId,
            type: 'default',
            animated: false,
            style: { ...GROUP_INTERNAL_EDGE_STYLE },
          });
        }
      }

      for (const port of getGroupPorts(nodeData, 'output')) {
        for (const insideLink of port.insideLinks) {
          if (!visibleNodeIds.has(insideLink.nodeId)) continue;
          internalPortEdges.push({
            id: `group-binding:${node.id}:output:${port.id}:${insideLink.nodeId}:${insideLink.handleId}`,
            source: insideLink.nodeId,
            sourceHandle: insideLink.handleId,
            target: node.id,
            targetHandle: buildGroupHandleId('output', port.id, 'internal'),
            type: 'default',
            animated: false,
            style: { ...GROUP_INTERNAL_EDGE_STYLE },
          });
        }
      }
    }

    for (const edge of store.edges) {
      const sourceDescriptor = parseGroupHandleId(edge.sourceHandle);
      const targetDescriptor = parseGroupHandleId(edge.targetHandle);
      const sourceNodeForEdge = nodeMap.get(edge.source);
      const targetNodeForEdge = nodeMap.get(edge.target);
      const sourceIsCollapsedGroupExternal =
        sourceNodeForEdge?.type === 'group'
        && collapsedGroupIds.has(edge.source)
        && sourceDescriptor?.role === 'external';
      const targetIsCollapsedGroupExternal =
        targetNodeForEdge?.type === 'group'
        && collapsedGroupIds.has(edge.target)
        && targetDescriptor?.role === 'external';

      if (
        sourceDescriptor
        && sourceNodeForEdge?.type === 'group'
        && sourceDescriptor.side === 'input'
        && sourceDescriptor.role === 'internal'
      ) {
        const port = findGroupPort(
          (sourceNodeForEdge.data || {}) as Record<string, unknown>,
          'input',
          sourceDescriptor.portId,
        );
        if (port?.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle)) {
          continue;
        }
      }

      if (
        targetDescriptor
        && targetNodeForEdge?.type === 'group'
        && targetDescriptor.side === 'output'
        && targetDescriptor.role === 'internal'
      ) {
        const port = findGroupPort(
          (targetNodeForEdge.data || {}) as Record<string, unknown>,
          'output',
          targetDescriptor.portId,
        );
        if (port?.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle)) {
          continue;
        }
      }

      if (sourceIsCollapsedGroupExternal || targetIsCollapsedGroupExternal) {
        visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
        continue;
      }

      const sourceGroupId = getNearestGroupAncestorId(edge.source, nodeMap);
      const targetGroupId = getNearestGroupAncestorId(edge.target, nodeMap);
      const sourceCollapsedGroupId = getVisibleCollapsedAncestorId(edge.source, nodeMap, collapsedGroupIds);
      const targetCollapsedGroupId = getVisibleCollapsedAncestorId(edge.target, nodeMap, collapsedGroupIds);
      const visibleSourceGroupId = sourceCollapsedGroupId || sourceGroupId;
      const visibleTargetGroupId = targetCollapsedGroupId || targetGroupId;

      if (!visibleSourceGroupId && !visibleTargetGroupId) {
        visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
        continue;
      }

      if (visibleSourceGroupId && visibleTargetGroupId && visibleSourceGroupId === visibleTargetGroupId) {
        if (!sourceCollapsedGroupId && !targetCollapsedGroupId) {
          visibleEdges.push(getDecoratedGroupEdge({ ...edge, type: 'default' }, sourceDescriptor, targetDescriptor));
        }
        continue;
      }

      if (!visibleSourceGroupId && visibleTargetGroupId) {
        const groupNode = nodeMap.get(visibleTargetGroupId);
        const ports = groupNode ? getGroupPorts((groupNode.data || {}) as Record<string, unknown>, 'input') : [];
        const port = ports.find((item) => item.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle));
        if (!port) continue;
        virtualEdges.push({
          id: `virtual:${edge.id}`,
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: visibleTargetGroupId,
          targetHandle: buildGroupHandleId('input', port.id, 'external'),
          type: 'default',
          animated: false,
          style: { ...GROUP_EXTERNAL_EDGE_STYLE },
        });
        continue;
      }

      if (visibleSourceGroupId && !visibleTargetGroupId) {
        const groupNode = nodeMap.get(visibleSourceGroupId);
        const ports = groupNode ? getGroupPorts((groupNode.data || {}) as Record<string, unknown>, 'output') : [];
        const port = ports.find((item) => item.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle));
        if (!port) continue;
        virtualEdges.push({
          id: `virtual:${edge.id}`,
          source: visibleSourceGroupId,
          sourceHandle: buildGroupHandleId('output', port.id, 'external'),
          target: edge.target,
          targetHandle: edge.targetHandle,
          type: 'default',
          animated: false,
          style: { ...GROUP_EXTERNAL_EDGE_STYLE },
        });
        continue;
      }

      if (visibleSourceGroupId && visibleTargetGroupId) {
        const sourceGroupNode = nodeMap.get(visibleSourceGroupId);
        const targetGroupNode = nodeMap.get(visibleTargetGroupId);
        const sourcePorts = sourceGroupNode ? getGroupPorts((sourceGroupNode.data || {}) as Record<string, unknown>, 'output') : [];
        const targetPorts = targetGroupNode ? getGroupPorts((targetGroupNode.data || {}) as Record<string, unknown>, 'input') : [];
        const sourcePort = sourcePorts.find((item) => item.insideLinks.some((link) => link.nodeId === edge.source && link.handleId === edge.sourceHandle));
        const targetPort = targetPorts.find((item) => item.insideLinks.some((link) => link.nodeId === edge.target && link.handleId === edge.targetHandle));
        if (!sourcePort || !targetPort) continue;
        virtualEdges.push({
          id: `virtual:${edge.id}`,
          source: visibleSourceGroupId,
          sourceHandle: buildGroupHandleId('output', sourcePort.id, 'external'),
          target: visibleTargetGroupId,
          targetHandle: buildGroupHandleId('input', targetPort.id, 'external'),
          type: 'default',
          animated: false,
          style: { ...GROUP_EXTERNAL_EDGE_STYLE },
        });
      }
    }

    return {
      nodes: visibleNodes,
      edges: [...visibleEdges, ...virtualEdges, ...internalPortEdges],
      collapsedGroupIds,
      nodeMap,
    };
  }, [store.edges, store.nodes]);

  const renderNodes = renderModel.nodes;
  const renderEdges = useMemo(() => {
    const previewEdges = buildEdgeInsertionPreviewEdges(edgeInsertionCandidate, renderNodes, renderModel.edges);
    const renderNodeMap = new Map(renderNodes.map((node) => [node.id, node]));
    return [
      ...renderModel.edges.map((edge) => (
        edge.id !== edgeInsertionCandidate?.edgeId
          ? edge
          : {
              ...edge,
              animated: false,
              className: [edge.className, 'workflow-edge-insertion-target'].filter(Boolean).join(' '),
              style: {
                ...(edge.style || {}),
                stroke: getEdgeDataTypeColor(edge, renderNodeMap),
                strokeWidth: 2,
              },
            }
      )),
      ...previewEdges,
    ];
  }, [edgeInsertionCandidate, renderModel.edges, renderNodes]);

  const attachNodeToGroup = useCallback((nodeId: string, groupId: string) => {
    useWorkflowStore.setState((state) => {
      const nodeMap = new Map(state.nodes.map((node) => [node.id, node as FlowNodeType]));
      const node = nodeMap.get(nodeId);
      const groupNode = nodeMap.get(groupId);
      if (!node || !groupNode || groupNode.type !== 'group') return {};

      const groupPosition = getAbsoluteNodePosition(groupId, nodeMap);
      const nextNode = constrainChildNodeToGroupContent({
        ...node,
        parentId: groupId,
        extent: 'parent',
        position: {
          x: node.position.x - groupPosition.x,
          y: node.position.y - groupPosition.y,
        },
      }, groupNode);

      return {
        nodes: enforceGroupLayout(state.nodes.map((item) => (
          item.id === nodeId ? nextNode : item
        ))),
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const commitConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

    const currentStore = useWorkflowStore.getState();
    const nodeMap = new Map(currentStore.nodes.map((node) => [node.id, node as FlowNodeType]));
    const resolvedConnection = resolveDirectionalGroupConnection(connection, nodeMap);
    if (!resolvedConnection) return;

    const sourceNode = nodeMap.get(resolvedConnection.source);
    const targetNode = nodeMap.get(resolvedConnection.target);
    if (!sourceNode || !targetNode) return;

    const sourceGroupHandle = parseGroupHandleId(resolvedConnection.sourceHandle);
    const targetGroupHandle = parseGroupHandleId(resolvedConnection.targetHandle);

    if (!sourceGroupHandle && !targetGroupHandle) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      targetGroupHandle
      && targetNode.type === 'group'
      && targetGroupHandle.side === 'output'
      && targetGroupHandle.role === 'internal'
    ) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      sourceGroupHandle
      && sourceNode.type === 'group'
      && sourceGroupHandle.side === 'input'
      && sourceGroupHandle.role === 'internal'
    ) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      sourceGroupHandle
      && sourceNode.type === 'group'
      && sourceGroupHandle.side === 'output'
      && sourceGroupHandle.role === 'external'
    ) {
      const sourcePort = findGroupPort((sourceNode.data || {}) as Record<string, unknown>, 'output', sourceGroupHandle.portId);
      if (sourcePort && isGroupPortExternallyConnectable(sourcePort)) {
        currentStore.addEdge(
          resolvedConnection.source,
          resolvedConnection.sourceHandle,
          resolvedConnection.target,
          resolvedConnection.targetHandle,
        );
      }
      return;
    }

    if (
      targetGroupHandle
      && targetNode.type === 'group'
      && targetGroupHandle.side === 'input'
      && targetGroupHandle.role === 'external'
    ) {
      const targetPort = findGroupPort((targetNode.data || {}) as Record<string, unknown>, 'input', targetGroupHandle.portId);
      if (targetPort && isGroupPortExternallyConnectable(targetPort)) {
        currentStore.addEdge(
          resolvedConnection.source,
          resolvedConnection.sourceHandle,
          resolvedConnection.target,
          resolvedConnection.targetHandle,
        );
      }
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setActiveCategory(null);
  }, []);

  const resolveRenderableEdgeId = useCallback((edge: Edge) => {
    if (edge.id.startsWith('virtual:')) {
      return edge.id.slice('virtual:'.length);
    }

    if (edge.id.startsWith('group-binding:')) {
      return store.edges.find((candidate) => (
        candidate.source === edge.source
        && candidate.sourceHandle === edge.sourceHandle
        && candidate.target === edge.target
        && candidate.targetHandle === edge.targetHandle
      ))?.id || null;
    }

    return edge.id;
  }, [store.edges]);

  const endEdgeCutting = useCallback(() => {
    edgeCutPreviousPointRef.current = null;
    edgeCutRemovedIdsRef.current.clear();
    setEdgeCuttingActive(false);
  }, []);

  const cutEdgesAlongPointerSegment = useCallback((
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const cuttableEdges = findCuttableEdgesAlongSegment(start, end, renderNodes, renderModel.edges);

    for (const edge of cuttableEdges) {
      const edgeId = resolveRenderableEdgeId(edge);
      if (!edgeId || edgeCutRemovedIdsRef.current.has(edgeId)) continue;
      edgeCutRemovedIdsRef.current.add(edgeId);
      store.removeEdge(edgeId);
    }
  }, [renderModel.edges, renderNodes, resolveRenderableEdgeId, store]);

  const getPointerFlowPosition = useCallback((event: ReactPointerEvent<HTMLDivElement>) => (
    reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
  ), [reactFlow]);

  const onCanvasPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.altKey || event.button !== 0 || isEditableElement(event.target)) return;

    const position = getPointerFlowPosition(event);
    edgeCutPreviousPointRef.current = position;
    edgeCutRemovedIdsRef.current.clear();
    setEdgeCuttingActive(true);
    closeContextMenu();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [closeContextMenu, getPointerFlowPosition]);

  const onCanvasPointerMoveCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!edgeCuttingActive) return;

    if (!event.altKey || (event.buttons & 1) !== 1) {
      endEdgeCutting();
      return;
    }

    const current = getPointerFlowPosition(event);
    const previous = edgeCutPreviousPointRef.current || current;
    cutEdgesAlongPointerSegment(previous, current);
    edgeCutPreviousPointRef.current = current;
    event.preventDefault();
    event.stopPropagation();
  }, [cutEdgesAlongPointerSegment, edgeCuttingActive, endEdgeCutting, getPointerFlowPosition]);

  const onCanvasPointerUpCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!edgeCuttingActive) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endEdgeCutting();
    event.preventDefault();
    event.stopPropagation();
  }, [edgeCuttingActive, endEdgeCutting]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    store.onNodesChange(changes);
  }, [store]);

  const onNodeDrag = useCallback<NodeMouseHandler>((_, node) => {
    if (isNodeLockedWithAncestors(node.id, store.nodes)) {
      setEdgeInsertionCandidate(null);
      return;
    }

    const candidate = findEdgeInsertionCandidate(node as FlowNodeType, renderNodes, renderModel.edges);
    setEdgeInsertionCandidate(candidate ? { edgeId: candidate.id, node: node as FlowNodeType } : null);
  }, [renderModel.edges, renderNodes, store.nodes]);

  const onNodeDragStop = useCallback<NodeMouseHandler>((_, node) => {
    if (isNodeLockedWithAncestors(node.id, store.nodes)) return;
    const corrected = pushRootNodeOutsideGroupAreas(node as FlowNodeType, renderNodes);
    let snapped = store.snapToGridEnabled ? snapNodeBox(corrected as FlowNodeType) : corrected;
    const parentId = (snapped as FlowNodeType & { parentId?: string }).parentId;
    if (parentId) {
      const parentNode = renderNodes.find((item) => item.id === parentId);
      if (parentNode?.type === 'group') {
        snapped = constrainChildNodeToGroupContent(snapped as FlowNodeType, parentNode);
      }
    }
    useWorkflowStore.setState((state) => ({
      nodes: enforceGroupLayout(state.nodes.map((item) => (
        item.id === node.id
          ? {
              ...item,
              position: snapped.position,
              width: snapped.width,
              height: snapped.height,
            }
          : item
      ))),
        hasUnsavedChanges: true,
      }));

    const candidate = findEdgeInsertionCandidate(snapped as FlowNodeType, renderNodes, renderModel.edges);
    const edgeId = candidate?.id || edgeInsertionCandidate?.edgeId;
    setEdgeInsertionCandidate(null);
    if (edgeId) {
      store.insertNodeOnEdge(node.id, edgeId);
    }
  }, [edgeInsertionCandidate?.edgeId, renderModel.edges, renderNodes, store]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    store.onEdgesChange(changes);
  }, [store]);

  const onEdgeDoubleClick = useCallback<EdgeMouseHandler>((event, edge) => {
    event.preventDefault();
    event.stopPropagation();

    if (edge.id.startsWith('group-binding:')) {
      const actualEdge = store.edges.find((candidate) => (
        candidate.source === edge.source
        && candidate.sourceHandle === edge.sourceHandle
        && candidate.target === edge.target
        && candidate.targetHandle === edge.targetHandle
      ));
      if (actualEdge) {
        store.removeEdge(actualEdge.id);
        return;
      }
    }

    store.removeEdge(edge.id);
  }, [store]);

  const onConnect = useCallback((connection: Connection) => {
    commitConnection(connection);
  }, [commitConnection]);

  const isValidConnection = useCallback((connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;

    const sourceNode = renderModel.nodeMap.get(connection.source);
    const targetNode = renderModel.nodeMap.get(connection.target);
    if (!sourceNode || !targetNode) return false;

    const resolvedConnection = resolveDirectionalGroupConnection(connection, renderModel.nodeMap);
    if (!resolvedConnection) return false;

    const sourceDescriptor = parseGroupHandleId(resolvedConnection.sourceHandle);
    const targetDescriptor = parseGroupHandleId(resolvedConnection.targetHandle);
    const sourceGroupId = getNearestGroupAncestorId(connection.source, renderModel.nodeMap);
    const targetGroupId = getNearestGroupAncestorId(connection.target, renderModel.nodeMap);

    if (!sourceDescriptor && !targetDescriptor && sourceGroupId !== targetGroupId) {
      return false;
    }

    if (
      sourceDescriptor
      && sourceNode.type === 'group'
      && sourceDescriptor.side === 'input'
      && sourceDescriptor.role === 'internal'
    ) {
      const sourcePort = findGroupPort(
        (sourceNode.data || {}) as Record<string, unknown>,
        'input',
        sourceDescriptor.portId,
      );
      if (!sourcePort || sourceNode.id !== getParentId(targetNode) || !resolvedConnection.targetHandle) return false;

      const targetType = getInputType(targetNode, resolvedConnection.targetHandle);
      if (!targetType) return false;

      if (!sourcePort.type) return true;
      const compatibleTargets = PORT_COMPATIBILITY[sourcePort.type];
      return compatibleTargets?.includes(targetType) ?? false;
    }

    if (
      targetDescriptor
      && targetNode.type === 'group'
      && targetDescriptor.side === 'output'
      && targetDescriptor.role === 'internal'
    ) {
      const targetPort = findGroupPort(
        (targetNode.data || {}) as Record<string, unknown>,
        'output',
        targetDescriptor.portId,
      );
      if (!targetPort || targetNode.id !== getParentId(sourceNode) || !resolvedConnection.sourceHandle) return false;
      if (targetPort.insideLinks.length > 0) return false;

      const sourceType = getOutputType(sourceNode, resolvedConnection.sourceHandle);
      if (!sourceType) return false;

      if (!targetPort.type) return true;
      const compatibleTargets = PORT_COMPATIBILITY[sourceType];
      return compatibleTargets?.includes(targetPort.type) ?? false;
    }

    const sourceType = getOutputType(sourceNode, resolvedConnection.sourceHandle);
    const targetType = getInputType(targetNode, resolvedConnection.targetHandle);
    if (!sourceType || !targetType) return false;

    if (sourceDescriptor) {
      if (sourceDescriptor.side !== 'output' || sourceDescriptor.role !== 'external') return false;
      if (!canConnectToGroupHandleExternally(sourceNode, resolvedConnection.sourceHandle)) return false;
    }

    if (targetDescriptor) {
      if (targetDescriptor.side !== 'input' || targetDescriptor.role !== 'external') return false;
      if (!canConnectToGroupHandleExternally(targetNode, resolvedConnection.targetHandle)) return false;
    }

    const compatibleTargets = PORT_COMPATIBILITY[sourceType];
    return compatibleTargets?.includes(targetType) ?? false;
  }, [renderModel.nodeMap]);

  const onNodeClick = useCallback((event: ReactMouseEvent, node: { id: string }) => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
      store.selectNode(node.id);
    } else {
      store.selectNode(node.id);
    }
    closeContextMenu();
  }, [closeContextMenu, store]);

  const onPaneClick = useCallback(() => {
    if (wasContextMenuJustOpened()) return;
    store.selectNode(null);
    closeContextMenu();
  }, [closeContextMenu, store, wasContextMenuJustOpened]);

  const openContextMenuAtPoint = useCallback((
    kind: ContextMenuKind,
    event: MouseEvent | TouchEvent | ReactMouseEvent,
    extras?: Partial<ContextMenuState>,
  ) => {
    const point = getLocalPoint(event, containerRef.current);
    const flowPosition = reactFlow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    const layout = getContextMenuLayout(kind, containerRef.current, point.localX, point.localY);
    setContextMenu({
      kind,
      x: layout.x,
      y: layout.y,
      flowPosition,
      horizontalDirection: layout.horizontalDirection,
      ...extras,
    });
    contextMenuOpenedAtRef.current = Date.now();
    setActiveCategory(null);
  }, [reactFlow]);

  const onNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    store.selectNode(node.id);
    const selectedIds = store.nodes.filter((item) => item.selected).map((item) => item.id);
    const nextSelectedIds =
      selectedIds.includes(node.id) && selectedIds.length > 1 ? selectedIds : [node.id];
    openContextMenuAtPoint('node', event, { nodeId: node.id, selectedNodeIds: nextSelectedIds });
  }, [openContextMenuAtPoint, store]);

  const onPaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const selectedIds = store.nodes.filter((item) => item.selected).map((item) => item.id);
    if (selectedIds.length > 0) {
      openContextMenuAtPoint('node', event, { selectedNodeIds: selectedIds });
      return;
    }

    store.selectNode(null);
    openContextMenuAtPoint('paneActions', event);
  }, [openContextMenuAtPoint, store]);

  const onPaneDoubleClickOpenMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!isPaneBackgroundTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    store.selectNode(null);
    openContextMenuAtPoint('pane', event);
  }, [openContextMenuAtPoint, store]);

  const updateLastPointerFlowPosition = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }

    lastPointerFlowPositionRef.current = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
  }, [reactFlow]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData('application/reactflow');
    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (nodeType && !DISABLED_NEW_NODE_TYPES.has(nodeType)) {
      store.addNode(nodeType, position, buildDefaultData(nodeType));
      return;
    }

    if (nodeType && DISABLED_NEW_NODE_TYPES.has(nodeType)) {
      closeContextMenu();
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;

    files.forEach((file, index) => {
      const droppedNodeType = getDroppedFileNodeType(file);
      if (!droppedNodeType || DISABLED_NEW_NODE_TYPES.has(droppedNodeType)) return;

      const nodeId = store.addNode(
        droppedNodeType,
        getDropNodePosition(droppedNodeType, position, index),
        buildDefaultData(droppedNodeType),
      );

      if (droppedNodeType === 'textInput') {
        void file.text()
          .then((text) => {
            store.updateNodeData(nodeId, { text });
          })
          .catch((error) => {
            store.updateNodeData(nodeId, {
              text: `导入文本没有完成，请检查文件编码或稍后重试。${error instanceof Error ? error.message : ''}`,
            });
          });
        return;
      }

      const localPreview = URL.createObjectURL(file);
      store.updateNodeData(nodeId, {
        fileUrl: '',
        previewUrl: localPreview,
        localPath: file.webkitRelativePath || file.name,
        fileName: file.name,
        fileKind: droppedNodeType === 'imageInput'
          ? 'image'
          : droppedNodeType === 'videoInput'
            ? 'video'
            : 'audio',
        fileSize: file.size,
        _uploading: true,
        _uploadError: '',
      });

      void uploadFile(file)
        .then((result) => {
          if (result.success && result.url) {
            URL.revokeObjectURL(localPreview);
            store.updateNodeData(nodeId, {
              fileUrl: result.url,
              previewUrl: result.url,
              fileName: result.fileName || file.name,
              fileSize: result.fileSize || file.size,
              _uploading: false,
              _uploadError: '',
            });
            return;
          }

          URL.revokeObjectURL(localPreview);
          store.updateNodeData(nodeId, {
            previewUrl: '',
            _uploading: false,
            _uploadError: formatCanvasUploadError(result.error),
          });
        })
        .catch((error) => {
          URL.revokeObjectURL(localPreview);
          store.updateNodeData(nodeId, {
            previewUrl: '',
            _uploading: false,
            _uploadError: formatCanvasUploadError(error instanceof Error ? error.message : ''),
          });
        });
    });
  }, [reactFlow, store]);

  const onConnectStart = useCallback((_: unknown, params: {
    nodeId?: string | null;
    handleId?: string | null;
    handleType?: 'source' | 'target' | null;
  }) => {
    if (!params.handleType || !params.nodeId || !params.handleId) {
      pendingConnectionRef.current = null;
      return;
    }

    const node = store.nodes.find((item) => item.id === params.nodeId);
    if (!node) {
      pendingConnectionRef.current = null;
      return;
    }

    const def = getNodeDef(node.type || '');
    const groupDescriptor = parseGroupHandleId(params.handleId);
    if (groupDescriptor && node.type === 'group') {
      const port = findGroupPort(
        (node.data || {}) as Record<string, unknown>,
        groupDescriptor.side,
        groupDescriptor.portId,
      );
      if (!port) {
        pendingConnectionRef.current = null;
        return;
      }

      if (params.handleType === 'source') {
        if (groupDescriptor.side === 'output' && groupDescriptor.role === 'external' && !isGroupPortExternallyConnectable(port)) {
          pendingConnectionRef.current = null;
          return;
        }
        pendingConnectionRef.current = {
          allowCreateNode: groupDescriptor.side === 'output' && groupDescriptor.role === 'external' && isGroupPortExternallyConnectable(port),
          handleType: 'source',
          sourceId: params.nodeId,
          sourceHandle: params.handleId,
          sourceType: port.type || 'any',
        };
        return;
      }

      if (groupDescriptor.side === 'input' && groupDescriptor.role === 'external' && !isGroupPortExternallyConnectable(port)) {
        pendingConnectionRef.current = null;
        return;
      }

      pendingConnectionRef.current = {
        allowCreateNode: groupDescriptor.side === 'input' && groupDescriptor.role === 'external' && isGroupPortExternallyConnectable(port),
        handleType: 'target',
        targetId: params.nodeId,
        targetHandle: params.handleId,
        targetType: port.type || 'any',
      };
      return;
    }

    if (!def) {
      pendingConnectionRef.current = null;
      return;
    }

    if (params.handleType === 'source') {
      const port = def.outputs.find((output) => output.id === params.handleId);
      if (!port) {
        pendingConnectionRef.current = null;
        return;
      }

      pendingConnectionRef.current = {
        allowCreateNode: true,
        handleType: 'source',
        sourceId: params.nodeId,
        sourceHandle: params.handleId,
        sourceType: port.type,
      };
      return;
    }

    const port = def.maxInputs ? def.inputs[0] : def.inputs.find((input) => input.id === params.handleId);
    if (!port) {
      pendingConnectionRef.current = null;
      return;
    }

    pendingConnectionRef.current = {
      allowCreateNode: true,
      handleType: 'target',
      targetId: params.nodeId,
      targetHandle: params.handleId,
      targetType: port.type,
    };
  }, [store.nodes]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: { isValid: boolean | null }) => {
    const pending = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pending || state.isValid || !pending.allowCreateNode) return;
    openContextMenuAtPoint('connect', event, { sourceConnection: pending });
  }, [openContextMenuAtPoint]);

  const contextNodeIds = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.selectedNodeIds?.length) return contextMenu.selectedNodeIds;
    return contextMenu.nodeId ? [contextMenu.nodeId] : [];
  }, [contextMenu]);

  const selectedNodeIds = useMemo(
    () => store.nodes.filter((node) => node.selected).map((node) => node.id),
    [store.nodes],
  );

  const contextNodes = useMemo(() => (
    contextNodeIds
      .map((nodeId) => store.nodes.find((item) => item.id === nodeId))
      .filter(Boolean)
  ), [contextNodeIds, store.nodes]);

  const hasMultipleContextNodes = contextNodes.length > 1;
  const hasSingleGroupContextNode = contextNodes.length === 1 && contextNodes[0]?.type === 'group';
  const hasSingleChildContextNode = contextNodes.length === 1 && Boolean((contextNodes[0] as FlowNodeType & { parentId?: string })?.parentId);
  const hasSingleImageInputContextNode = contextNodes.length === 1 && contextNodes[0]?.type === 'imageInput';
  const canDetachSingleContextNode = contextNodes.length === 1 && contextNodes[0]?.type !== 'group';
  const canCreateGroup = hasMultipleContextNodes && contextNodes.every((node) => node?.type !== 'group');
  const allContextNodesDisabled = contextNodes.length > 0 && contextNodes.every((node) => Boolean(node?.data?.disabled));
  const allContextNodesLocked = contextNodes.length > 0 && contextNodes.every((node) => Boolean(node?.data?.locked));
  const canvasEditorNode = useMemo(() => {
    if (!canvasEditorNodeId) return null;
    return store.nodes.find((node) => node.id === canvasEditorNodeId) || null;
  }, [canvasEditorNodeId, store.nodes]);
  const canvasEditorSource = useMemo(() => {
    if (!canvasEditorNode) return '';
    const fileUrl = typeof canvasEditorNode.data?.fileUrl === 'string' ? canvasEditorNode.data.fileUrl : '';
    const previewUrl = typeof canvasEditorNode.data?.previewUrl === 'string' ? canvasEditorNode.data.previewUrl : '';
    return previewUrl && !(previewUrl.startsWith('blob:') && fileUrl) ? previewUrl : fileUrl;
  }, [canvasEditorNode]);
  const canvasEditorMaskSource = useMemo(() => {
    if (!canvasEditorNode) return '';
    const fileUrl = typeof canvasEditorNode.data?.maskFileUrl === 'string' ? canvasEditorNode.data.maskFileUrl : '';
    const previewUrl = typeof canvasEditorNode.data?.maskPreviewUrl === 'string' ? canvasEditorNode.data.maskPreviewUrl : '';
    return previewUrl && !(previewUrl.startsWith('blob:') && fileUrl) ? previewUrl : fileUrl;
  }, [canvasEditorNode]);

  const getViewportCenterFlowPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [reactFlow]);

  const copyNodesToClipboard = useCallback((nodeIds: string[], shouldCloseMenu = true) => {
    if (nodeIds.length === 0) return false;
    const snapshot = buildClipboardSnapshot(renderNodes, store.edges, nodeIds);
    if (!snapshot) return;
    setClipboardNode(snapshot);
    if (shouldCloseMenu) closeContextMenu();
    return true;
  }, [closeContextMenu, renderNodes, store.edges]);

  const copySelectedNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    copyNodesToClipboard([contextMenu.nodeId]);
  }, [contextMenu?.nodeId, copyNodesToClipboard]);

  const copyContextNodes = useCallback(() => {
    copyNodesToClipboard(contextNodeIds);
  }, [contextNodeIds, copyNodesToClipboard]);

  const pasteClipboardAtPosition = useCallback((flowPosition: { x: number; y: number }) => {
    if (!clipboardNode) return false;
    const idMap = new Map<string, string>();
    const rootNodeIds = clipboardNode.nodes
      .filter((node) => {
        const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
        return !parentId || !clipboardNode.nodes.some((item) => item.id === parentId);
      })
      .map((node) => node.id);

    const nodesToPaste = clipboardNode.nodes.map((node) => {
      idMap.set(node.id, `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
      return node;
    });

    const nextNodes = nodesToPaste
      .sort((a, b) => {
        const aIsRoot = rootNodeIds.includes(a.id);
        const bIsRoot = rootNodeIds.includes(b.id);
        if (aIsRoot !== bIsRoot) return aIsRoot ? -1 : 1;
        if ((a.type === 'group') !== (b.type === 'group')) return a.type === 'group' ? -1 : 1;
        return 0;
      })
      .map((node) => {
        const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
        const nextParentId = parentId && idMap.has(parentId) ? idMap.get(parentId) : undefined;
        const position = nextParentId
          ? { ...node.position }
          : {
              x: snapValue(flowPosition.x + (node.position.x - clipboardNode.bounds.minX)),
              y: snapValue(flowPosition.y + (node.position.y - clipboardNode.bounds.minY)),
            };

        let extent = (node as FlowNodeType & { extent?: unknown }).extent;
        if (Array.isArray(extent)) {
          const coordinateExtent = extent as CoordinateExtent;
          extent = [[...coordinateExtent[0]], [...coordinateExtent[1]]] as CoordinateExtent;
        }

        const nextData = FORCE_DISABLED_NODE_TYPES.has(node.type || '')
          ? { ...node.data, disabled: true }
          : node.data;

        return {
          ...node,
          id: idMap.get(node.id) || node.id,
          position,
          parentId: nextParentId,
          extent,
          data: nextData,
          selected: false,
        } as FlowNodeType;
      });

    const nextNodeMap = new Map(nextNodes.map((node) => [node.id, node]));
    const constrainedNextNodes = nextNodes.map((node) => {
      const parentId = (node as FlowNodeType & { parentId?: string }).parentId;
      if (parentId) {
        const parentNode = nextNodeMap.get(parentId);
        if (parentNode?.type === 'group') {
          return constrainChildNodeToGroupContent(node, parentNode);
        }
        return node;
      }

      return pushRootNodeOutsideGroupAreas(node, [...renderNodes, ...nextNodes]);
    });

    const nextEdges = clipboardNode.edges.map((edge) => ({
      id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      source: idMap.get(edge.source) || edge.source,
      sourceHandle: edge.sourceHandle,
      target: idMap.get(edge.target) || edge.target,
      targetHandle: edge.targetHandle,
      type: 'default',
      animated: false,
      style: { strokeWidth: 2 },
    }));

    useWorkflowStore.setState((state) => ({
      nodes: enforceGroupLayout([...state.nodes.map((node) => ({ ...node, selected: false })), ...constrainedNextNodes]),
      edges: [...state.edges, ...nextEdges],
      selectedNodeId: constrainedNextNodes.find((node) => node.type === 'group')?.id || constrainedNextNodes[0]?.id || null,
      hasUnsavedChanges: true,
    }));
    closeContextMenu();
    return true;
  }, [clipboardNode, closeContextMenu, store]);

  const pasteNodeAtContext = useCallback(() => {
    if (!contextMenu) return;
    pasteClipboardAtPosition(contextMenu.flowPosition);
  }, [contextMenu, pasteClipboardAtPosition]);

  const deleteContextNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    store.removeNode(contextMenu.nodeId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store]);

  const detachContextNodeFromChain = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    store.detachNodeFromChain(contextMenu.nodeId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store]);

  const createGroupFromContextNodes = useCallback(() => {
    if (contextNodeIds.length < 2) return;
    store.createNodeGroup(contextNodeIds);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  useEffect(() => {
    const handleClipboardHotkeys = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      if (event.altKey) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        if (selectedNodeIds.length === 0) return;
        if (!copyNodesToClipboard(selectedNodeIds, false)) return;
        event.preventDefault();
        closeContextMenu();
        return;
      }

      if (key === 'v') {
        if (!clipboardNode) return;
        const pastePosition = lastPointerFlowPositionRef.current
          || (contextMenu && contextMenu.kind !== 'node' ? contextMenu.flowPosition : null)
          || getViewportCenterFlowPosition();
        if (!pasteClipboardAtPosition(pastePosition)) return;
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleClipboardHotkeys);
    return () => window.removeEventListener('keydown', handleClipboardHotkeys);
  }, [
    clipboardNode,
    closeContextMenu,
    contextMenu,
    copyNodesToClipboard,
    getViewportCenterFlowPosition,
    pasteClipboardAtPosition,
    selectedNodeIds,
  ]);

  const ungroupContextNodes = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.ungroupNodes(contextNodeIds);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  const deleteContextNodes = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.removeNodes(contextNodeIds);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  const releaseContextNodesFromGroup = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.releaseNodesFromGroup(contextNodeIds);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  const setContextNodesDisabled = useCallback((disabled: boolean) => {
    if (contextNodeIds.length === 0) return;
    store.toggleNodesDisabled(contextNodeIds, disabled);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  const setContextNodesLocked = useCallback((locked: boolean) => {
    if (contextNodeIds.length === 0) return;
    store.toggleNodesLocked(contextNodeIds, locked);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

  const resetContextNodeSize = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    store.resetNodeSize(contextMenu.nodeId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store]);

  const openCanvasEditorForContextNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const node = store.nodes.find((item) => item.id === contextMenu.nodeId);
    if (!node || node.type !== 'imageInput') return;
    const fileUrl = typeof node.data?.fileUrl === 'string' ? node.data.fileUrl : '';
    const previewUrl = typeof node.data?.previewUrl === 'string' ? node.data.previewUrl : '';
    if (!fileUrl && !previewUrl) return;
    setCanvasEditorNodeId(node.id);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store.nodes]);

  const saveCanvasEditorAsset = useCallback(async (
    nodeId: string,
    file: File,
    previewUrl: string,
    target: 'paint' | 'mask',
  ) => {
    if (target === 'paint') {
      store.updateNodeData(nodeId, {
        fileUrl: '',
        previewUrl,
        fileName: file.name,
        fileKind: 'image',
        fileSize: file.size,
        _uploading: true,
        _uploadError: '',
      });
    } else {
      store.updateNodeData(nodeId, {
        maskFileUrl: '',
        maskPreviewUrl: previewUrl,
        maskFileName: file.name,
        maskFileSize: file.size,
        _maskUploading: true,
        _maskUploadError: '',
      });
    }

    const result = await uploadFile(file);
    if (!result.success || !result.url) {
      if (target === 'paint') {
        store.updateNodeData(nodeId, {
          _uploading: false,
          _uploadError: formatCanvasUploadError(result.error),
        });
      } else {
        store.updateNodeData(nodeId, {
          _maskUploading: false,
          _maskUploadError: formatCanvasUploadError(result.error),
        });
      }
      throw new Error(formatCanvasUploadError(result.error));
    }

    if (target === 'paint') {
      store.updateNodeData(nodeId, {
        fileUrl: result.url,
        previewUrl,
        fileName: result.fileName || file.name,
        fileSize: result.fileSize || file.size,
        _uploading: false,
        _uploadError: '',
      });
      return;
    }

    store.updateNodeData(nodeId, {
      maskFileUrl: result.url,
      maskPreviewUrl: previewUrl,
      maskFileName: result.fileName || file.name,
      maskFileSize: result.fileSize || file.size,
      _maskUploading: false,
      _maskUploadError: '',
    });
  }, [store]);

  const resolveTargetHandle = useCallback((nodeType: string, sourceType?: string) => {
    const def = getNodeDef(nodeType);
    if (!def) return null;
    if (def.maxInputs) return 'item1';

    if (!sourceType) return def.inputs[0]?.id || null;

    const matchingInput = def.inputs.find((input) => {
      const compatibleTargets = PORT_COMPATIBILITY[sourceType];
      return compatibleTargets?.includes(input.type) ?? false;
    });

    return matchingInput?.id || null;
  }, []);

  const resolveSourceHandle = useCallback((nodeType: string, targetType?: string) => {
    const def = getNodeDef(nodeType);
    if (!def) return null;

    if (!targetType) return def.outputs[0]?.id || null;

    const matchingOutput = def.outputs.find((output) => {
      const compatibleTargets = PORT_COMPATIBILITY[output.type];
      return compatibleTargets?.includes(targetType) ?? false;
    });

    return matchingOutput?.id || null;
  }, []);

  const addNodeFromMenu = useCallback((nodeType: string) => {
    if (!contextMenu) return;
    if (DISABLED_NEW_NODE_TYPES.has(nodeType)) return;

    const position = getCenteredPosition(nodeType, contextMenu.flowPosition);
    const newNodeId = store.addNode(nodeType, position, buildDefaultData(nodeType));

    if (contextMenu.kind === 'connect' && contextMenu.sourceConnection) {
      const pending = contextMenu.sourceConnection;

      if (pending.handleType === 'source') {
        const sourceDescriptor = parseGroupHandleId(pending.sourceHandle);
        if (sourceDescriptor?.side === 'input' && sourceDescriptor.role === 'internal') {
          attachNodeToGroup(newNodeId, pending.sourceId);
        }

        const targetHandle = resolveTargetHandle(nodeType, pending.sourceType);
        if (targetHandle) {
          commitConnection({
            source: pending.sourceId,
            sourceHandle: pending.sourceHandle,
            target: newNodeId,
            targetHandle,
          });
        }
      } else {
        const targetDescriptor = parseGroupHandleId(pending.targetHandle);
        if (targetDescriptor?.side === 'output' && targetDescriptor.role === 'internal') {
          attachNodeToGroup(newNodeId, pending.targetId);
        }

        const sourceHandle = resolveSourceHandle(nodeType, pending.targetType);
        if (sourceHandle) {
          commitConnection({
            source: newNodeId,
            sourceHandle,
            target: pending.targetId,
            targetHandle: pending.targetHandle,
          });
        }
      }
    }

    closeContextMenu();
  }, [attachNodeToGroup, closeContextMenu, commitConnection, contextMenu, resolveSourceHandle, resolveTargetHandle, store]);

  const availableNodeDefs = useMemo(() => {
    if (!contextMenu) return [];

    if (contextMenu.kind !== 'connect' || !contextMenu.sourceConnection) {
      return NODE_REGISTRY.filter((nodeDef) => nodeDef.type !== 'group' && !DISABLED_NEW_NODE_TYPES.has(nodeDef.type));
    }

    const pending = contextMenu.sourceConnection;

    return NODE_REGISTRY.filter((nodeDef) => nodeDef.type !== 'group' && !DISABLED_NEW_NODE_TYPES.has(nodeDef.type)).filter((nodeDef) => {
      if (pending.handleType === 'source') {
        if (nodeDef.inputs.length === 0) return false;

        const sourceType = pending.sourceType;
        const sampleInput = nodeDef.maxInputs
          ? nodeDef.inputs[0]
          : nodeDef.inputs.find((input) => {
              const compatibleTargets = PORT_COMPATIBILITY[sourceType];
              return compatibleTargets?.includes(input.type) ?? false;
            });

        if (!sampleInput) return false;
        const compatibleTargets = PORT_COMPATIBILITY[sourceType];
        return compatibleTargets?.includes(sampleInput.type) ?? false;
      }

      if (nodeDef.outputs.length === 0) return false;
      return nodeDef.outputs.some((output) => {
        const compatibleTargets = PORT_COMPATIBILITY[output.type];
        return compatibleTargets?.includes(pending.targetType) ?? false;
      });
    });
  }, [contextMenu]);

  const groupedNodeDefs = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: availableNodeDefs.filter((nodeDef) => nodeDef.category === category),
    })).filter((group) => group.items.length > 0);
  }, [availableNodeDefs]);

  const miniMapNodeColor = useCallback((node: { type?: string | null }) => {
    return NODE_COLORS[node.type || ''] || '#8E8E93';
  }, []);

  const currentNodeCategory = groupedNodeDefs.some((group) => group.category === activeCategory)
    ? activeCategory
    : groupedNodeDefs[0]?.category || null;
  const currentNodeItems = groupedNodeDefs.find((group) => group.category === currentNodeCategory)?.items || [];

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDoubleClick={onPaneDoubleClickOpenMenu}
      onMouseMove={updateLastPointerFlowPosition}
      onPointerDownCapture={onCanvasPointerDownCapture}
      onPointerMoveCapture={onCanvasPointerMoveCapture}
      onPointerUpCapture={onCanvasPointerUpCapture}
      onPointerCancelCapture={onCanvasPointerUpCapture}
    >
      <ReactFlow
        nodes={renderNodes}
        edges={renderEdges}
        connectionMode={ConnectionMode.Strict}
        onInit={reportViewportCenter}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onMoveEnd={reportViewportCenter}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{
          type: 'default',
          style: DEFAULT_WORKFLOW_EDGE_STYLE,
        }}
        connectionLineStyle={{
          stroke: 'var(--color-accent)',
          strokeWidth: 2,
        }}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.82,
          maxZoom: 1.15,
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.96 }}
        snapToGrid={store.snapToGridEnabled}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        deleteKeyCode={null}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{
          background: 'var(--color-bg-canvas)',
          cursor: edgeCuttingActive ? 'crosshair' : spaceHeld ? 'grab' : undefined,
        }}
        panOnDrag={edgeCuttingActive ? false : spaceHeld ? [0, 1] : [1]}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={!spaceHeld && !edgeCuttingActive}
        selectNodesOnDrag={!spaceHeld && !edgeCuttingActive}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1.25}
          color="var(--color-grid-dot)"
          style={{ opacity: 1 }}
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          nodeColor={miniMapNodeColor}
          maskColor="rgba(0, 0, 0, 0.15)"
          style={{
            width: 144,
            height: 104,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            opacity: 0.72,
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {contextMenu && (
        contextMenu.kind === 'node' || contextMenu.kind === 'paneActions' ? (
          <div
            className="workflow-context-menu workflow-context-menu--root"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {contextMenu.kind === 'paneActions' ? (
              <>
                <ContextMenuButton
                  label="粘贴节点"
                  onClick={pasteNodeAtContext}
                  disabled={!clipboardNode}
                  title={!clipboardNode ? '剪贴板里还没有可粘贴的节点' : undefined}
                />
              </>
            ) : hasMultipleContextNodes ? (
              <>
                {canCreateGroup && <ContextMenuButton label="创建节点组" onClick={createGroupFromContextNodes} />}
                <ContextMenuButton label="复制所选节点" onClick={copyContextNodes} />
                <ContextMenuButton
                  label={allContextNodesDisabled ? '启用所选节点' : '禁用所选节点'}
                  onClick={() => setContextNodesDisabled(!allContextNodesDisabled)}
                />
                <ContextMenuButton
                  label={allContextNodesLocked ? '解锁所选节点' : '锁定所选节点'}
                  onClick={() => setContextNodesLocked(!allContextNodesLocked)}
                />
                <ContextMenuButton label="删除所选节点" onClick={deleteContextNodes} danger />
              </>
            ) : (
              <>
                <ContextMenuButton label={hasSingleGroupContextNode ? '复制节点组' : '复制节点'} onClick={hasSingleGroupContextNode ? copyContextNodes : copySelectedNode} />
                <ContextMenuButton
                  label={allContextNodesLocked ? (hasSingleGroupContextNode ? '解锁组' : '解锁节点') : (hasSingleGroupContextNode ? '锁定组' : '锁定节点')}
                  onClick={() => setContextNodesLocked(!allContextNodesLocked)}
                />
                <ContextMenuButton
                  label={allContextNodesDisabled ? (hasSingleGroupContextNode ? '启用组' : '启用节点') : (hasSingleGroupContextNode ? '禁用组' : '禁用节点')}
                  onClick={() => setContextNodesDisabled(!allContextNodesDisabled)}
                />
                {hasSingleImageInputContextNode && (
                  <ContextMenuButton
                    label="进入画板"
                    onClick={openCanvasEditorForContextNode}
                    disabled={!canvasEditorSource && !contextNodes[0]?.data?.fileUrl && !contextNodes[0]?.data?.previewUrl}
                    title={(!canvasEditorSource && !contextNodes[0]?.data?.fileUrl && !contextNodes[0]?.data?.previewUrl) ? '当前节点还没有图片，无法进入画板' : undefined}
                  />
                )}
                {hasSingleGroupContextNode && <ContextMenuButton label="解组" onClick={ungroupContextNodes} />}
                {hasSingleChildContextNode && <ContextMenuButton label="从组释放" onClick={releaseContextNodesFromGroup} />}
                {canDetachSingleContextNode && <ContextMenuButton label="摘除并重接" onClick={detachContextNodeFromChain} />}
                <ContextMenuButton label="恢复默认尺寸" onClick={resetContextNodeSize} />
                <ContextMenuButton label={hasSingleGroupContextNode ? '删除组' : '删除节点'} onClick={deleteContextNode} danger />
              </>
            )}
          </div>
        ) : (
          <div className="workflow-context-panel-layer" onClick={closeContextMenu}>
            <div
              className="workflow-context-menu workflow-context-menu--panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="workflow-context-menu__catalog">
                <div className="workflow-context-menu__catalog-header">
                  <div className="workflow-context-menu__catalog-title">
                    {contextMenu.kind === 'connect' ? '连接到新节点' : '新建节点'}
                  </div>
                  <div className="workflow-context-menu__catalog-subtitle">
                    {contextMenu.kind === 'connect' ? '只显示当前端口可以连接的节点' : '选择一个节点插入到画布'}
                  </div>
                </div>

                {clipboardNode && contextMenu.kind !== 'connect' && (
                  <ContextMenuButton label="粘贴节点" onClick={pasteNodeAtContext} />
                )}

                <div className="workflow-context-menu__category-strip">
                  {groupedNodeDefs.map((group) => (
                    <button
                      key={group.category}
                      type="button"
                      className={[
                        'workflow-context-menu__category-chip',
                        currentNodeCategory === group.category ? 'workflow-context-menu__category-chip--active' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setActiveCategory(group.category)}
                    >
                      <span>{group.label}</span>
                      <span className="workflow-context-menu__category-count">{group.items.length}</span>
                    </button>
                  ))}
                </div>

                <div className="workflow-context-menu__node-list">
                  {currentNodeItems.map((nodeDef) => (
                    <NodeCatalogButton
                      key={nodeDef.type}
                      nodeDef={nodeDef}
                      onClick={() => addNodeFromMenu(nodeDef.type)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {canvasEditorNode && canvasEditorSource && (
        <NodeCanvasEditorModal
          src={canvasEditorSource}
          initialMaskSrc={canvasEditorMaskSource || undefined}
          nodeLabel={getNodeDef(canvasEditorNode.type || '')?.label || '图像输入'}
          initialMode="mask"
          onClose={() => setCanvasEditorNodeId(null)}
          onSavePaint={async (file, previewUrl) => {
            await saveCanvasEditorAsset(canvasEditorNode.id, file, previewUrl, 'paint');
          }}
          onSaveMask={async (file, previewUrl) => {
            await saveCanvasEditorAsset(canvasEditorNode.id, file, previewUrl, 'mask');
          }}
        />
      )}
    </div>
  );
}

function ContextMenuButton({
  label,
  onClick,
  danger = false,
  active = false,
  disabled = false,
  onHover,
  title,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onHover?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      className={[
        'workflow-context-menu__item',
        danger ? 'workflow-context-menu__item--danger' : '',
        active ? 'workflow-context-menu__item--active' : '',
        disabled ? 'workflow-context-menu__item--disabled' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={() => {
        if (!disabled) onHover?.();
      }}
      title={title || (disabled ? DISABLED_NODE_REASON : label)}
    >
      {label}
    </button>
  );
}

function NodeCatalogButton({
  nodeDef,
  onClick,
}: {
  nodeDef: (typeof NODE_REGISTRY)[number];
  onClick: () => void;
}) {
  const Icon = NODE_ICONS[nodeDef.icon] || NODE_ICONS.eye;
  const inputCount = nodeDef.maxInputs ? `${nodeDef.maxInputs}+` : String(nodeDef.inputs.length);
  const outputCount = String(nodeDef.outputs.length);

  return (
    <button
      type="button"
      className="workflow-context-menu__node-card"
      onClick={onClick}
      title={nodeDef.label}
    >
      <span
        className="workflow-context-menu__node-icon"
        style={{
          color: nodeDef.color || '#8E8E93',
          background: `${nodeDef.color || '#8E8E93'}18`,
          border: `1px solid ${nodeDef.color || '#8E8E93'}28`,
        }}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2.1} />
      </span>
      <span className="workflow-context-menu__node-copy">
        <span className="workflow-context-menu__node-label">{nodeDef.label}</span>
        <span className="workflow-context-menu__node-meta">{inputCount} 入 / {outputCount} 出</span>
      </span>
    </button>
  );
}

export default function FlowCanvas({ onViewportCenterChange }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner onViewportCenterChange={onViewportCenterChange} />
    </ReactFlowProvider>
  );
}


