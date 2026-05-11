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
} from 'react';
import {
  getExpandedNodeOutputs,
  getNodeDef,
  GRID_SIZE,
  NODE_REGISTRY,
  PORT_COMPATIBILITY,
} from '@/features/workflow/lib/constants';
import { uploadFile } from '@/features/workflow/lib/api';
import {
  findGroupPort,
  isGroupPortExternallyConnectable,
  parseGroupHandleId,
} from '@/features/workflow/lib/groupPorts';
import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/features/workflow/lib/store/editorShared';
import { useWorkflowCanvasStore } from '@/features/workflow/lib/store/selectors';
import { NodeCanvasEditorModal } from './NodeCanvasEditorModal';
import {
  FLOW_CATEGORY_LABELS,
  FLOW_CATEGORY_ORDER,
  FLOW_DISABLED_NEW_NODE_TYPES,
  FLOW_DISABLED_NODE_REASON,
  FLOW_FORCE_DISABLED_NODE_TYPES,
  FLOW_NODE_COLORS,
  FLOW_NODE_TYPES,
} from './flowCanvasConfig';
import {
  buildDefaultData,
  getCenteredPosition,
  getDroppedFileNodeType,
} from './flowCanvasHelpers';
import {
  canConnectToGroupHandleExternally,
  getInputType,
  getOutputType,
  getParentId,
  resolveDirectionalGroupConnection,
} from './flowCanvasConnections';
import {
  buildClipboardSnapshot,
  getAbsoluteNodePosition,
  getDropNodePosition,
  snapNodeBox,
  snapValue,
} from './flowCanvasClipboard';
import { findCuttableEdgesAlongSegment } from './flowCanvasGeometry';
import {
  buildEdgeInsertionPreviewEdges,
  findEdgeInsertionCandidate,
  getContextMenuLayout,
  getEdgeDataTypeColor,
  getLocalPoint,
  getNearestGroupAncestorId,
  isPaneBackgroundTarget,
  DEFAULT_WORKFLOW_EDGE_STYLE,
} from './flowCanvasUiHelpers';
import { buildFlowCanvasRenderModel } from './flowCanvasRenderModel';
import { formatCanvasUploadError, isEditableElement } from './flowCanvasText';
import type {
  ClipboardSnapshot,
  ContextMenuKind,
  ContextMenuState,
  EdgeInsertionCandidate,
  PendingConnection,
} from './flowCanvasTypes';
import { NODE_ICONS } from './nodes/nodeConstants';
import './contextMenu.css';

interface FlowCanvasProps {
  onViewportCenterChange?: (position: { x: number; y: number }) => void;
}

function FlowCanvasInner({ onViewportCenterChange }: FlowCanvasProps) {
  const store = useWorkflowCanvasStore();
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof FLOW_CATEGORY_ORDER)[number] | null>(null);
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

  const renderModel = useMemo(() => buildFlowCanvasRenderModel({
    nodes: store.nodes as FlowNodeType[],
    edges: store.edges,
  }), [store.edges, store.nodes]);

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
    const cuttableEdges = findCuttableEdgesAlongSegment(start, end, renderNodes, renderModel.edges, 14);

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

  const addFilesToCanvas = useCallback((files: File[], position: { x: number; y: number }) => {
    files.forEach((file, index) => {
      const droppedNodeType = getDroppedFileNodeType(file);
      if (!droppedNodeType || FLOW_DISABLED_NEW_NODE_TYPES.has(droppedNodeType)) return;

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
  }, [store]);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData('application/reactflow');
    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (nodeType && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) {
      store.addNode(nodeType, position, buildDefaultData(nodeType));
      return;
    }

    if (nodeType && FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) {
      closeContextMenu();
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;

    addFilesToCanvas(files, position);
  }, [addFilesToCanvas, closeContextMenu, reactFlow, store]);

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
      const currentNode = store.nodes.find((item) => item.id === params.nodeId);
      const outputs = def.maxOutputs ? getExpandedNodeOutputs(currentNode?.type || '', (currentNode?.data || {}) as Record<string, unknown>) : def.outputs;
      const port = outputs.find((output) => output.id === params.handleId);
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

        const nextData = FLOW_FORCE_DISABLED_NODE_TYPES.has(node.type || '')
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
    };

    window.addEventListener('keydown', handleClipboardHotkeys);
    return () => window.removeEventListener('keydown', handleClipboardHotkeys);
  }, [
    closeContextMenu,
    copyNodesToClipboard,
    selectedNodeIds,
  ]);

  useEffect(() => {
    const handleClipboardPaste = (event: ClipboardEvent) => {
      if (isEditableElement(event.target)) return;

      const pastedImageFiles = Array.from(event.clipboardData?.files || [])
        .filter((file) => file.type.startsWith('image/'));
      if (pastedImageFiles.length === 0) {
        Array.from(event.clipboardData?.items || []).forEach((item) => {
          if (item.kind !== 'file' || !item.type.startsWith('image/')) return;
          const file = item.getAsFile();
          if (file) pastedImageFiles.push(file);
        });
      }
      const pastePosition = lastPointerFlowPositionRef.current
        || (contextMenu && contextMenu.kind !== 'node' ? contextMenu.flowPosition : null)
        || getViewportCenterFlowPosition();

      if (pastedImageFiles.length > 0) {
        event.preventDefault();
        closeContextMenu();
        addFilesToCanvas(pastedImageFiles, pastePosition);
        return;
      }

      if (!clipboardNode) return;
      if (!pasteClipboardAtPosition(pastePosition)) return;
      event.preventDefault();
    };

    window.addEventListener('paste', handleClipboardPaste);
    return () => window.removeEventListener('paste', handleClipboardPaste);
  }, [
    addFilesToCanvas,
    clipboardNode,
    closeContextMenu,
    contextMenu,
    getViewportCenterFlowPosition,
    pasteClipboardAtPosition,
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
    const outputs = def.maxOutputs ? getExpandedNodeOutputs(nodeType, buildDefaultData(nodeType)) : def.outputs;

    if (!targetType) return outputs[0]?.id || null;

    const matchingOutput = outputs.find((output) => {
      const compatibleTargets = PORT_COMPATIBILITY[output.type];
      return compatibleTargets?.includes(targetType) ?? false;
    });

    return matchingOutput?.id || null;
  }, []);

  const addNodeFromMenu = useCallback((nodeType: string) => {
    if (!contextMenu) return;
    if (FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) return;

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
      return NODE_REGISTRY.filter((nodeDef) => nodeDef.type !== 'group' && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeDef.type));
    }

    const pending = contextMenu.sourceConnection;

    return NODE_REGISTRY.filter((nodeDef) => nodeDef.type !== 'group' && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeDef.type)).filter((nodeDef) => {
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

      const outputs = nodeDef.maxOutputs ? getExpandedNodeOutputs(nodeDef.type, buildDefaultData(nodeDef.type)) : nodeDef.outputs;
      if (outputs.length === 0) return false;
      return outputs.some((output) => {
        const compatibleTargets = PORT_COMPATIBILITY[output.type];
        return compatibleTargets?.includes(pending.targetType) ?? false;
      });
    });
  }, [contextMenu]);

  const groupedNodeDefs = useMemo(() => {
    return FLOW_CATEGORY_ORDER.map((category) => ({
      category,
      label: FLOW_CATEGORY_LABELS[category],
      items: availableNodeDefs.filter((nodeDef) => nodeDef.category === category),
    })).filter((group) => group.items.length > 0);
  }, [availableNodeDefs]);

  const miniMapNodeColor = useCallback((node: { type?: string | null }) => {
    return FLOW_NODE_COLORS[node.type || ''] || '#8E8E93';
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
        nodeTypes={FLOW_NODE_TYPES}
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
      title={title || (disabled ? FLOW_DISABLED_NODE_REASON : label)}
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


