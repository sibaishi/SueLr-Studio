import {
  Background,
  BackgroundVariant,
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
} from 'react';
import {
  getNodeDef,
  getNodeDefaultSize,
  GRID_SIZE,
  NODE_REGISTRY,
  PORT_COMPATIBILITY,
} from '@/features/workflow/lib/constants';
import { uploadFile } from '@/features/workflow/lib/api';
import { constrainChildNodeToGroupContent, enforceGroupLayout, pushRootNodeOutsideGroupAreas } from '@/features/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { useWorkflowCanvasStore } from '@/features/workflow/lib/store/selectors';
import { NodeCanvasEditorModal } from './NodeCanvasEditorModal';
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

const CATEGORY_LABELS = {
  group: '节点组',
  input: '输入',
  api: 'API',
  merge: '合并',
  ai: 'AI 能力',
  output: '输出',
} as const;

const CATEGORY_ORDER = ['input', 'api', 'merge', 'ai', 'output', 'group'] as const;
const DISABLED_NEW_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);
const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);
const DISABLED_NODE_REASON = '暂时停用，无法新建';

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
      handleType: 'source';
      sourceId: string;
      sourceHandle: string;
      sourceType: string;
    }
  | {
      handleType: 'target';
      targetId: string;
      targetHandle: string;
      targetType: string;
    };

type ContextMenuKind = 'pane' | 'node' | 'connect';
type MenuHorizontalDirection = 'left' | 'right';

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
  const menuWidth = kind === 'node' ? 220 : 204;
  const menuHeight = kind === 'node' ? 288 : 116;
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
  const [editableFocused, setEditableFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeRootAction, setActiveRootAction] = useState<'new' | 'connect' | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_ORDER)[number] | null>(null);
  const [clipboardNode, setClipboardNode] = useState<ClipboardSnapshot | null>(null);
  const [canvasEditorNodeId, setCanvasEditorNodeId] = useState<string | null>(null);
  const pendingConnectionRef = useRef<PendingConnection | null>(null);
  const contextMenuOpenedAtRef = useRef(0);

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
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };

    const handleBlur = () => setSpaceHeld(false);

    const handleFocusIn = (event: FocusEvent) => {
      setEditableFocused(isEditableElement(event.target));
    };

    const handleFocusOut = () => {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      setEditableFocused(isEditableElement(active));
    };

    const closeMenuOnWindowClick = () => {
      if (wasContextMenuJustOpened()) return;
      setContextMenu(null);
      setActiveRootAction(null);
      setActiveCategory(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('click', closeMenuOnWindowClick);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('click', closeMenuOnWindowClick);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [wasContextMenuJustOpened]);

  const renderNodes = useMemo(() => {
    return store.nodes.map((node) => {
      const inputCount = typeof node.data?.inputCount === 'number' ? node.data.inputCount : 1;
      const size = getNodeDefaultSize(node.type || '', inputCount);
      const width = typeof node.width === 'number' ? Math.max(node.width, size.w) : size.w;
      const height = typeof node.height === 'number' ? Math.max(node.height, size.h) : size.h;

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
    }).sort((a, b) => {
      const aParent = Boolean((a as FlowNodeType & { parentId?: string }).parentId);
      const bParent = Boolean((b as FlowNodeType & { parentId?: string }).parentId);
      if (aParent !== bParent) return aParent ? 1 : -1;
      if ((a.type === 'group') !== (b.type === 'group')) return a.type === 'group' ? -1 : 1;
      return 0;
    });
  }, [store.nodes]);

  const renderEdges = useMemo(() => {
    return store.edges.map((edge) => ({ ...edge, type: 'default' }));
  }, [store.edges]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setActiveRootAction(null);
    setActiveCategory(null);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    store.onNodesChange(changes);
  }, [store]);

  const onNodeDragStop = useCallback<NodeMouseHandler>((_, node) => {
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
  }, [renderNodes, store.snapToGridEnabled]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    store.onEdgesChange(changes);
  }, [store]);

  const onEdgeDoubleClick = useCallback<EdgeMouseHandler>((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    store.removeEdge(edge.id);
  }, [store]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    store.addEdge(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);
  }, [store]);

  const isValidConnection = useCallback((connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;

    const sourceNode = store.nodes.find((node) => node.id === connection.source);
    const targetNode = store.nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const sourceDef = getNodeDef(sourceNode.type || '');
    const targetDef = getNodeDef(targetNode.type || '');
    if (!sourceDef || !targetDef) return false;

    const sourcePort = sourceDef.outputs.find((port) => port.id === connection.sourceHandle);
    const targetPort = targetDef.maxInputs
      ? targetDef.inputs[0]
        ? { ...targetDef.inputs[0], id: connection.targetHandle }
        : undefined
      : targetDef.inputs.find((port) => port.id === connection.targetHandle);

    if (!sourcePort || !targetPort) return false;

    const compatibleTargets = PORT_COMPATIBILITY[sourcePort.type];
    return compatibleTargets?.includes(targetPort.type) ?? false;
  }, [store.nodes]);

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
    setActiveRootAction(kind === 'connect' ? 'connect' : null);
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
    openContextMenuAtPoint('pane', event);
  }, [openContextMenuAtPoint, store]);

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
    const def = getNodeDef(node?.type || '');
    if (!node || !def) {
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
      handleType: 'target',
      targetId: params.nodeId,
      targetHandle: params.handleId,
      targetType: port.type,
    };
  }, [store.nodes]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: { isValid: boolean | null }) => {
    const pending = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pending || state.isValid) return;
    openContextMenuAtPoint('connect', event, { sourceConnection: pending });
  }, [openContextMenuAtPoint]);

  const contextNodeIds = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.selectedNodeIds?.length) return contextMenu.selectedNodeIds;
    return contextMenu.nodeId ? [contextMenu.nodeId] : [];
  }, [contextMenu]);

  const contextNodes = useMemo(() => (
    contextNodeIds
      .map((nodeId) => store.nodes.find((item) => item.id === nodeId))
      .filter(Boolean)
  ), [contextNodeIds, store.nodes]);

  const hasMultipleContextNodes = contextNodes.length > 1;
  const hasSingleGroupContextNode = contextNodes.length === 1 && contextNodes[0]?.type === 'group';
  const hasSingleChildContextNode = contextNodes.length === 1 && Boolean((contextNodes[0] as FlowNodeType & { parentId?: string })?.parentId);
  const hasSingleImageInputContextNode = contextNodes.length === 1 && contextNodes[0]?.type === 'imageInput';
  const canCreateGroup = hasMultipleContextNodes && contextNodes.every((node) => node?.type !== 'group');
  const allContextNodesDisabled = contextNodes.length > 0 && contextNodes.every((node) => Boolean(node?.data?.disabled));
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

  const copySelectedNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const snapshot = buildClipboardSnapshot(renderNodes, store.edges, [contextMenu.nodeId]);
    if (!snapshot) return;
    setClipboardNode(snapshot);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, renderNodes, store.edges]);

  const copyContextNodes = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    const snapshot = buildClipboardSnapshot(renderNodes, store.edges, contextNodeIds);
    if (!snapshot) return;
    setClipboardNode(snapshot);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, renderNodes, store.edges]);

  const pasteNodeAtContext = useCallback(() => {
    if (!contextMenu || !clipboardNode) return;
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
              x: snapValue(contextMenu.flowPosition.x + (node.position.x - clipboardNode.bounds.minX)),
              y: snapValue(contextMenu.flowPosition.y + (node.position.y - clipboardNode.bounds.minY)),
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
  }, [clipboardNode, closeContextMenu, contextMenu, store]);

  const deleteContextNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    store.removeNode(contextMenu.nodeId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu?.nodeId, store]);

  const createGroupFromContextNodes = useCallback(() => {
    if (contextNodeIds.length < 2) return;
    store.createNodeGroup(contextNodeIds);
    closeContextMenu();
  }, [closeContextMenu, contextNodeIds, store]);

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
      if (contextMenu.sourceConnection.handleType === 'source') {
        const targetHandle = resolveTargetHandle(nodeType, contextMenu.sourceConnection.sourceType);
        if (targetHandle) {
          store.addEdge(
            contextMenu.sourceConnection.sourceId,
            contextMenu.sourceConnection.sourceHandle,
            newNodeId,
            targetHandle,
          );
        }
      } else {
        const sourceHandle = resolveSourceHandle(nodeType, contextMenu.sourceConnection.targetType);
        if (sourceHandle) {
          store.addEdge(
            newNodeId,
            sourceHandle,
            contextMenu.sourceConnection.targetId,
            contextMenu.sourceConnection.targetHandle,
          );
        }
      }
    }

    closeContextMenu();
  }, [closeContextMenu, contextMenu, resolveSourceHandle, resolveTargetHandle, store]);

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

  const submenuSideKey = contextMenu?.horizontalDirection === 'left' ? 'right' : 'left';
  const rootActionKey = contextMenu?.kind === 'connect' ? 'connect' : 'new';

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={renderNodes}
        edges={renderEdges}
        onInit={reportViewportCenter}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
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
          style: { stroke: 'var(--color-text-tertiary)', strokeWidth: 2 },
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
        deleteKeyCode={editableFocused ? null : ['Backspace', 'Delete']}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{
          background: 'var(--color-bg-canvas)',
          cursor: spaceHeld ? 'grab' : undefined,
        }}
        panOnDrag={spaceHeld ? [0, 1] : [1]}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={!spaceHeld}
        selectNodesOnDrag={!spaceHeld}
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
        <div
          className="workflow-context-menu workflow-context-menu--root"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'node' ? (
            hasMultipleContextNodes ? (
              <>
                {canCreateGroup && <ContextMenuButton label="创建节点组" onClick={createGroupFromContextNodes} />}
                <ContextMenuButton label="复制所选节点" onClick={copyContextNodes} />
                <ContextMenuButton
                  label={allContextNodesDisabled ? '启用所选节点' : '禁用所选节点'}
                  onClick={() => setContextNodesDisabled(!allContextNodesDisabled)}
                />
                <ContextMenuButton label="删除所选节点" onClick={deleteContextNodes} danger />
              </>
            ) : (
              <>
                <ContextMenuButton label={hasSingleGroupContextNode ? '复制节点组' : '复制节点'} onClick={hasSingleGroupContextNode ? copyContextNodes : copySelectedNode} />
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
                <ContextMenuButton label="恢复默认尺寸" onClick={resetContextNodeSize} />
                <ContextMenuButton label={hasSingleGroupContextNode ? '删除组' : '删除节点'} onClick={deleteContextNode} danger />
              </>
            )
          ) : (
            <>
              {clipboardNode && <ContextMenuButton label="粘贴节点" onClick={pasteNodeAtContext} />}
              <ContextMenuButton
                label={contextMenu.kind === 'connect' ? '连接到新节点 ▸' : '新建节点 ▸'}
                onClick={() => undefined}
                active={activeRootAction === rootActionKey}
                onHover={() => {
                  setActiveRootAction(rootActionKey);
                  if (!activeCategory) {
                    setActiveCategory(groupedNodeDefs[0]?.category || null);
                  }
                }}
              />
            </>
          )}

          {activeRootAction && groupedNodeDefs.length > 0 && contextMenu.kind !== 'node' && (
            <div
              className="workflow-context-menu workflow-context-menu--submenu"
              style={{
                [submenuSideKey]: 'calc(100% + 6px)',
              }}
            >
              {groupedNodeDefs.map((group) => (
                <ContextMenuButton
                  key={group.category}
                  label={`${group.label} ▸`}
                  onClick={() => undefined}
                  active={activeCategory === group.category}
                  onHover={() => setActiveCategory(group.category)}
                />
              ))}

              {activeCategory && (
                <div
                  className="workflow-context-menu workflow-context-menu--submenu workflow-context-menu--items"
                  style={{
                    [submenuSideKey]: 'calc(100% + 6px)',
                  }}
                >
                  {groupedNodeDefs
                    .find((group) => group.category === activeCategory)
                    ?.items.map((nodeDef) => (
                      <ContextMenuButton
                        key={nodeDef.type}
                        label={nodeDef.label}
                        onClick={() => addNodeFromMenu(nodeDef.type)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
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

export default function FlowCanvas({ onViewportCenterChange }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner onViewportCenterChange={onViewportCenterChange} />
    </ReactFlowProvider>
  );
}


