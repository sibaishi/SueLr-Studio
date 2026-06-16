import {
  GRID_SIZE,
  NODE_REGISTRY,
  PORT_COMPATIBILITY,
  getExpandedNodeOutputs,
  getNodeDef,
} from '@/domains/workflow/lib/constants';
import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/domains/workflow/lib/groupLayout';
import { parseGroupHandleId } from '@/domains/workflow/lib/groupPorts';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import { useWorkflowCanvasStore } from '@/domains/workflow/lib/store/selectors';
import { AnimatedSvgEdge } from '@/shared/ui/AnimatedSvgEdge';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  type EdgeChange,
  type EdgeMouseHandler,
  type Node as FlowNodeType,
  MiniMap,
  type NodeChange,
  type NodeMouseHandler,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenuButton, NodeCatalogButton } from './flowCanvasCatalog';
import { getAbsoluteNodePosition, snapNodeBox } from './flowCanvasClipboard';
import {
  FLOW_CATEGORY_LABELS,
  FLOW_CATEGORY_ORDER,
  FLOW_DISABLED_NEW_NODE_TYPES,
  FLOW_NODE_COLORS,
  FLOW_NODE_TYPES,
} from './flowCanvasConfig';
import { buildDefaultData, getCenteredPosition } from './flowCanvasHelpers';
import { useFlowClipboard } from './flowCanvasHooks/useFlowClipboard';
import { useFlowConnection } from './flowCanvasHooks/useFlowConnection';
import { useFlowContextMenu } from './flowCanvasHooks/useFlowContextMenu';
import { useFlowEdgeCutting } from './flowCanvasHooks/useFlowEdgeCutting';
import { useFlowFileDrop } from './flowCanvasHooks/useFlowFileDrop';
import { buildFlowCanvasRenderModel } from './flowCanvasRenderModel';
import { isEditableElement } from './flowCanvasText';
import type { EdgeInsertionCandidate } from './flowCanvasTypes';
import {
  DEFAULT_WORKFLOW_EDGE_STYLE,
  buildEdgeInsertionPreviewEdges,
  findEdgeInsertionCandidate,
  getEdgeDataTypeColor,
} from './flowCanvasUiHelpers';
import './contextMenu.css';
import './nodes/nodeAnimations.css';

interface FlowCanvasProps {
  onViewportCenterChange?: (position: { x: number; y: number }) => void;
}

function FlowCanvasInner({ onViewportCenterChange }: FlowCanvasProps) {
  const store = useWorkflowCanvasStore();
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [edgeInsertionCandidate, setEdgeInsertionCandidate] = useState<EdgeInsertionCandidate | null>(null);
  const lastPointerFlowPositionRef = useRef<{ x: number; y: number } | null>(null);
  const ctxMenu = useFlowContextMenu({ store, reactFlow, containerRef });

  const reportViewportCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    onViewportCenterChange?.(
      reactFlow.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }),
    );
  }, [onViewportCenterChange, reactFlow]);

  useEffect(() => {
    reportViewportCenter();
    window.addEventListener('resize', reportViewportCenter);
    return () => window.removeEventListener('resize', reportViewportCenter);
  }, [reportViewportCenter]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        window.dispatchEvent(new Event('resize'));
        reportViewportCenter();
      });
    });

    observer.observe(container);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [reportViewportCenter]);

  useEffect(() => {
    const handleFocusNode = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;

      const targetNode = reactFlow.getNode(nodeId);
      if (!targetNode) return;

      useWorkflowStore.setState((state) => ({
        nodes: state.nodes.map((node) => ({ ...node, selected: node.id === nodeId })),
        selectedNodeId: nodeId,
      }));

      requestAnimationFrame(() => {
        const bounds = reactFlow.getNodesBounds([nodeId]);
        if (!bounds.width || !bounds.height) return;

        const containerRect = containerRef.current?.getBoundingClientRect();
        const availableWidth = containerRect?.width ? Math.max(containerRect.width - 96, 240) : 960;
        const availableHeight = containerRect?.height ? Math.max(containerRect.height - 160, 220) : 560;
        const fitZoom = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
        const currentZoom = reactFlow.getZoom();
        const targetZoom = Math.min(Math.max(Math.min(currentZoom, fitZoom), 0.42), 1.08);
        void reactFlow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
          zoom: targetZoom,
          duration: 260,
        });
      });
    };

    window.addEventListener('workflow:focus-node', handleFocusNode);
    return () => window.removeEventListener('workflow:focus-node', handleFocusNode);
  }, [reactFlow, store]);

  useEffect(() => {
    const handleOpenNodeCatalog = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      store.selectNode(null);
      ctxMenu.openContextMenuAtScreenPoint('pane', {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    };

    window.addEventListener('workflow:open-node-catalog', handleOpenNodeCatalog);
    return () => window.removeEventListener('workflow:open-node-catalog', handleOpenNodeCatalog);
  }, [ctxMenu, store]);

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
      if (ctxMenu.wasContextMenuJustOpened()) return;
      ctxMenu.closeContextMenu();
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
  }, [ctxMenu, store]);

  const renderModel = useMemo(
    () =>
      buildFlowCanvasRenderModel({
        nodes: store.nodes as FlowNodeType[],
        edges: store.edges,
      }),
    [store.edges, store.nodes],
  );

  const renderNodes = renderModel.nodes;
  const renderEdges = useMemo(() => {
    const previewEdges = buildEdgeInsertionPreviewEdges(edgeInsertionCandidate, renderNodes, renderModel.edges);
    const renderNodeMap = new Map(renderNodes.map((node) => [node.id, node]));
    const selectedIds = new Set(renderNodes.filter((n) => n.selected).map((n) => n.id));
    return [
      ...renderModel.edges.map((edge) => {
        const isConnected = selectedIds.has(edge.source) || selectedIds.has(edge.target);
        if (edge.id === edgeInsertionCandidate?.edgeId) {
          return {
            ...edge,
            animated: false,
            ...(isConnected
              ? {
                  type: 'animatedSvg' as const,
                  data: { ...(edge.data || {}), flow: true, color: getEdgeDataTypeColor(edge, renderNodeMap) },
                }
              : {}),
            className: [edge.className, 'workflow-edge-insertion-target'].filter(Boolean).join(' '),
            style: { ...(edge.style || {}), stroke: getEdgeDataTypeColor(edge, renderNodeMap), strokeWidth: 2 },
          };
        }
        if (!isConnected) return edge;
        const typeColor = getEdgeDataTypeColor(edge, renderNodeMap);
        return {
          ...edge,
          type: 'animatedSvg' as const,
          data: { ...(edge.data || {}), flow: true, color: typeColor },
          style: { ...(edge.style || {}), stroke: typeColor },
        };
      }),
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
      const nextNode = constrainChildNodeToGroupContent(
        {
          ...node,
          parentId: groupId,
          extent: 'parent',
          position: {
            x: node.position.x - groupPosition.x,
            y: node.position.y - groupPosition.y,
          },
        },
        groupNode,
      );

      return {
        nodes: enforceGroupLayout(state.nodes.map((item) => (item.id === nodeId ? nextNode : item))),
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const edgeCut = useFlowEdgeCutting({
    store,
    reactFlow,
    closeContextMenu: ctxMenu.closeContextMenu,
    renderEdges: renderModel.edges,
    renderNodes,
  });

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      store.onNodesChange(changes);
    },
    [store],
  );

  const onNodeDrag = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (isNodeLockedWithAncestors(node.id, store.nodes)) {
        setEdgeInsertionCandidate(null);
        return;
      }

      const candidate = findEdgeInsertionCandidate(node as FlowNodeType, renderNodes, renderModel.edges);
      setEdgeInsertionCandidate(candidate ? { edgeId: candidate.id, node: node as FlowNodeType } : null);
    },
    [renderModel.edges, renderNodes, store.nodes],
  );

  const onNodeDragStop = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (isNodeLockedWithAncestors(node.id, store.nodes)) {
        setEdgeInsertionCandidate(null);
        return;
      }

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
        nodes: enforceGroupLayout(
          state.nodes.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  position: snapped.position,
                  width: snapped.width,
                  height: snapped.height,
                }
              : item,
          ),
        ),
        hasUnsavedChanges: true,
      }));

      const candidate = findEdgeInsertionCandidate(snapped as FlowNodeType, renderNodes, renderModel.edges);
      const edgeId = candidate?.id || edgeInsertionCandidate?.edgeId;
      setEdgeInsertionCandidate(null);
      if (edgeId) {
        store.insertNodeOnEdge(node.id, edgeId);
      }
    },
    [edgeInsertionCandidate?.edgeId, renderModel.edges, renderNodes, store],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      store.onEdgesChange(changes);
    },
    [store],
  );

  const onEdgeDoubleClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      event.preventDefault();
      event.stopPropagation();

      if (edge.id.startsWith('group-binding:')) {
        const actualEdge = store.edges.find(
          (candidate) =>
            candidate.source === edge.source &&
            candidate.sourceHandle === edge.sourceHandle &&
            candidate.target === edge.target &&
            candidate.targetHandle === edge.targetHandle,
        );
        if (actualEdge) {
          store.removeEdge(actualEdge.id);
          return;
        }
      }

      store.removeEdge(edge.id);
    },
    [store],
  );

  const connection = useFlowConnection({
    store,
    reactFlow,
    openContextMenuAtPoint: ctxMenu.openContextMenuAtPoint,
    renderNodeMap: renderModel.nodeMap,
  });

  const onNodeClick = useCallback(
    (event: ReactMouseEvent, node: { id: string }) => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
        store.selectNode(node.id);
      } else {
        store.selectNode(node.id);
      }
      ctxMenu.closeContextMenu();
    },
    [ctxMenu, store],
  );

  const onPaneClick = useCallback(() => {
    if (ctxMenu.wasContextMenuJustOpened()) return;
    store.selectNode(null);
    ctxMenu.closeContextMenu();
  }, [ctxMenu, store]);

  const updateLastPointerFlowPosition = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
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
    },
    [reactFlow],
  );

  const fileDrop = useFlowFileDrop({ store, reactFlow, closeContextMenu: ctxMenu.closeContextMenu });
  const contextNodeIds = useMemo(() => {
    if (!ctxMenu.contextMenu) return [];
    if (ctxMenu.contextMenu.selectedNodeIds?.length) return ctxMenu.contextMenu.selectedNodeIds;
    return ctxMenu.contextMenu.nodeId ? [ctxMenu.contextMenu.nodeId] : [];
  }, [ctxMenu.contextMenu]);

  const selectedNodeIds = useMemo(
    () => store.nodes.filter((node) => node.selected).map((node) => node.id),
    [store.nodes],
  );

  const contextNodes = useMemo(
    () => contextNodeIds.map((nodeId) => store.nodes.find((item) => item.id === nodeId)).filter(Boolean),
    [contextNodeIds, store.nodes],
  );

  const hasMultipleContextNodes = contextNodes.length > 1;
  const hasSingleGroupContextNode = contextNodes.length === 1 && contextNodes[0]?.type === 'group';
  const hasSingleChildContextNode =
    contextNodes.length === 1 && Boolean((contextNodes[0] as FlowNodeType & { parentId?: string })?.parentId);
  const canDetachSingleContextNode = contextNodes.length === 1 && contextNodes[0]?.type !== 'group';
  const canRunToSingleContextNode = (() => {
    if (contextNodes.length !== 1) return false;
    const node = contextNodes[0];
    if (!node || node.type === 'group') return false;
    const def = getNodeDef(node.type || '');
    return Boolean(def && ((def.inputs?.length || 0) > 0 || (def.maxInputs || 0) > 0));
  })();
  const canCreateGroup = hasMultipleContextNodes && contextNodes.every((node) => node?.type !== 'group');
  const allContextNodesDisabled =
    contextNodes.length > 0 && contextNodes.every((node) => Boolean(node?.data?.disabled));
  const allContextNodesLocked = contextNodes.length > 0 && contextNodes.every((node) => Boolean(node?.data?.locked));
  const getViewportCenterFlowPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [reactFlow]);

  const clipboard = useFlowClipboard({
    store,
    reactFlow,
    closeContextMenu: ctxMenu.closeContextMenu,
    contextMenu: ctxMenu.contextMenu,
    contextNodeIds,
    selectedNodeIds,
    renderNodes,
    lastPointerFlowPositionRef,
    getViewportCenterFlowPosition,
    addFilesToCanvas: fileDrop.addFilesToCanvas,
  });

  const deleteContextNode = useCallback(() => {
    if (!ctxMenu.contextMenu?.nodeId) return;
    store.removeNode(ctxMenu.contextMenu.nodeId);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, ctxMenu.contextMenu?.nodeId, store]);

  const detachContextNodeFromChain = useCallback(() => {
    if (!ctxMenu.contextMenu?.nodeId) return;
    store.detachNodeFromChain(ctxMenu.contextMenu.nodeId);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, ctxMenu.contextMenu?.nodeId, store]);

  const runToContextNode = useCallback(() => {
    if (!ctxMenu.contextMenu?.nodeId) return;
    void store.executeWorkflowToNode(ctxMenu.contextMenu.nodeId);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, ctxMenu.contextMenu?.nodeId, store]);

  const createGroupFromContextNodes = useCallback(() => {
    if (contextNodeIds.length < 2) return;
    store.createNodeGroup(contextNodeIds);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, contextNodeIds, store]);

  const ungroupContextNodes = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.ungroupNodes(contextNodeIds);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, contextNodeIds, store]);

  const deleteContextNodes = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.removeNodes(contextNodeIds);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, contextNodeIds, store]);

  const releaseContextNodesFromGroup = useCallback(() => {
    if (contextNodeIds.length === 0) return;
    store.releaseNodesFromGroup(contextNodeIds);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, contextNodeIds, store]);

  const setContextNodesDisabled = useCallback(
    (disabled: boolean) => {
      if (contextNodeIds.length === 0) return;
      store.toggleNodesDisabled(contextNodeIds, disabled);
      ctxMenu.closeContextMenu();
    },
    [ctxMenu.closeContextMenu, contextNodeIds, store],
  );

  const setContextNodesLocked = useCallback(
    (locked: boolean) => {
      if (contextNodeIds.length === 0) return;
      store.toggleNodesLocked(contextNodeIds, locked);
      ctxMenu.closeContextMenu();
    },
    [ctxMenu.closeContextMenu, contextNodeIds, store],
  );

  const resetContextNodeSize = useCallback(() => {
    if (!ctxMenu.contextMenu?.nodeId) return;
    store.resetNodeSize(ctxMenu.contextMenu.nodeId);
    ctxMenu.closeContextMenu();
  }, [ctxMenu.closeContextMenu, ctxMenu.contextMenu?.nodeId, store]);

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

  const addNodeFromMenu = useCallback(
    (nodeType: string) => {
      if (!ctxMenu.contextMenu) return;
      if (FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) return;

      const position = getCenteredPosition(nodeType, ctxMenu.contextMenu.flowPosition);
      const newNodeId = store.addNode(nodeType, position, buildDefaultData(nodeType));

      if (ctxMenu.contextMenu.kind === 'connect' && ctxMenu.contextMenu.sourceConnection) {
        const pending = ctxMenu.contextMenu.sourceConnection;

        if (pending.handleType === 'source') {
          const sourceDescriptor = parseGroupHandleId(pending.sourceHandle);
          if (sourceDescriptor?.side === 'input' && sourceDescriptor.role === 'internal') {
            attachNodeToGroup(newNodeId, pending.sourceId);
          }

          const targetHandle = resolveTargetHandle(nodeType, pending.sourceType);
          if (targetHandle) {
            connection.commitConnection({
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
            connection.commitConnection({
              source: newNodeId,
              sourceHandle,
              target: pending.targetId,
              targetHandle: pending.targetHandle,
            });
          }
        }
      }

      ctxMenu.closeContextMenu();
    },
    [
      attachNodeToGroup,
      ctxMenu.closeContextMenu,
      connection,
      ctxMenu.contextMenu,
      resolveSourceHandle,
      resolveTargetHandle,
      store,
    ],
  );

  const availableNodeDefs = useMemo(() => {
    if (!ctxMenu.contextMenu) return [];

    if (ctxMenu.contextMenu.kind !== 'connect' || !ctxMenu.contextMenu.sourceConnection) {
      return NODE_REGISTRY.filter(
        (nodeDef) => nodeDef.type !== 'group' && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeDef.type),
      );
    }

    const pending = ctxMenu.contextMenu.sourceConnection;

    return NODE_REGISTRY.filter(
      (nodeDef) => nodeDef.type !== 'group' && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeDef.type),
    ).filter((nodeDef) => {
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

      const outputs = nodeDef.maxOutputs
        ? getExpandedNodeOutputs(nodeDef.type, buildDefaultData(nodeDef.type))
        : nodeDef.outputs;
      if (outputs.length === 0) return false;
      return outputs.some((output) => {
        const compatibleTargets = PORT_COMPATIBILITY[output.type];
        return compatibleTargets?.includes(pending.targetType) ?? false;
      });
    });
  }, [ctxMenu.contextMenu]);

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

  const currentNodeCategory = groupedNodeDefs.some((group) => group.category === ctxMenu.activeCategory)
    ? ctxMenu.activeCategory
    : groupedNodeDefs[0]?.category || null;
  const currentNodeItems = groupedNodeDefs.find((group) => group.category === currentNodeCategory)?.items || [];

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDoubleClick={ctxMenu.onPaneDoubleClickOpenMenu}
      onMouseMove={updateLastPointerFlowPosition}
      onPointerDownCapture={edgeCut.onCanvasPointerDownCapture}
      onPointerMoveCapture={edgeCut.onCanvasPointerMoveCapture}
      onPointerUpCapture={edgeCut.onCanvasPointerUpCapture}
      onPointerCancelCapture={edgeCut.onCanvasPointerUpCapture}
    >
      <ReactFlow
        nodes={renderNodes}
        edges={renderEdges}
        connectionMode={ConnectionMode.Strict}
        onInit={reportViewportCenter}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onConnect={connection.onConnect}
        onConnectStart={connection.onConnectStart}
        onConnectEnd={connection.onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeContextMenu={ctxMenu.onNodeContextMenu}
        onPaneContextMenu={ctxMenu.onPaneContextMenu}
        onMoveEnd={reportViewportCenter}
        onDragOver={fileDrop.onDragOver}
        onDrop={fileDrop.onDrop}
        nodeTypes={FLOW_NODE_TYPES}
        edgeTypes={{ animatedSvg: AnimatedSvgEdge }}
        isValidConnection={connection.isValidConnection}
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
          cursor: edgeCut.edgeCuttingActive ? 'crosshair' : spaceHeld ? 'grab' : undefined,
        }}
        panOnDrag={edgeCut.edgeCuttingActive ? false : spaceHeld ? [0, 1] : [1]}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={!spaceHeld && !edgeCut.edgeCuttingActive}
        selectNodesOnDrag={!spaceHeld && !edgeCut.edgeCuttingActive}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1.25}
          color="var(--color-grid-dot)"
          style={{ opacity: 1 }}
        />
        <Panel position="bottom-left" className="workflow-minimap-group">
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(0, 0, 0, 0.15)"
            style={{
              width: 148,
              height: 106,
            }}
            pannable
            zoomable
          />
        </Panel>
      </ReactFlow>

      {ctxMenu.contextMenu &&
        (ctxMenu.contextMenu.kind === 'node' || ctxMenu.contextMenu.kind === 'paneActions' ? (
          <div
            className="workflow-context-menu workflow-context-menu--root"
            style={{
              left: ctxMenu.contextMenu.x,
              top: ctxMenu.contextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {ctxMenu.contextMenu.kind === 'paneActions' ? (
              <>
                <ContextMenuButton
                  label="粘贴节点"
                  onClick={clipboard.pasteNodeAtContext}
                  disabled={!clipboard.clipboardNode}
                  title={!clipboard.clipboardNode ? '剪贴板里还没有可粘贴的节点' : undefined}
                />
              </>
            ) : hasMultipleContextNodes ? (
              <>
                {canCreateGroup && <ContextMenuButton label="创建节点组" onClick={createGroupFromContextNodes} />}
                <ContextMenuButton label="复制所选节点" onClick={clipboard.copyContextNodes} />
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
                <ContextMenuButton
                  label={hasSingleGroupContextNode ? '复制节点组' : '复制节点'}
                  onClick={hasSingleGroupContextNode ? clipboard.copyContextNodes : clipboard.copySelectedNode}
                />
                <ContextMenuButton
                  label={
                    allContextNodesLocked
                      ? hasSingleGroupContextNode
                        ? '解锁组'
                        : '解锁节点'
                      : hasSingleGroupContextNode
                        ? '锁定组'
                        : '锁定节点'
                  }
                  onClick={() => setContextNodesLocked(!allContextNodesLocked)}
                />
                <ContextMenuButton
                  label={
                    allContextNodesDisabled
                      ? hasSingleGroupContextNode
                        ? '启用组'
                        : '启用节点'
                      : hasSingleGroupContextNode
                        ? '禁用组'
                        : '禁用节点'
                  }
                  onClick={() => setContextNodesDisabled(!allContextNodesDisabled)}
                />
                {canRunToSingleContextNode && (
                  <ContextMenuButton
                    label="运行到该节点"
                    onClick={runToContextNode}
                    disabled={store.isExecuting || allContextNodesDisabled}
                    title={
                      store.isExecuting
                        ? '当前已有工作流正在运行'
                        : allContextNodesDisabled
                          ? '当前节点已禁用'
                          : undefined
                    }
                  />
                )}
                {hasSingleGroupContextNode && <ContextMenuButton label="解组" onClick={ungroupContextNodes} />}
                {hasSingleChildContextNode && (
                  <ContextMenuButton label="从组释放" onClick={releaseContextNodesFromGroup} />
                )}
                {canDetachSingleContextNode && (
                  <ContextMenuButton label="摘除并重接" onClick={detachContextNodeFromChain} />
                )}
                <ContextMenuButton label="恢复默认尺寸" onClick={resetContextNodeSize} />
                <ContextMenuButton
                  label={hasSingleGroupContextNode ? '删除组' : '删除节点'}
                  onClick={deleteContextNode}
                  danger
                />
              </>
            )}
          </div>
        ) : (
          <div className="workflow-context-panel-layer" onClick={ctxMenu.closeContextMenu}>
            <div
              className="workflow-context-menu workflow-context-menu--panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="workflow-context-menu__catalog">
                <div className="workflow-context-menu__catalog-header">
                  <div className="workflow-context-menu__catalog-title">
                    {ctxMenu.contextMenu.kind === 'connect' ? '连接到新节点' : '新建节点'}
                  </div>
                  <div className="workflow-context-menu__catalog-subtitle">
                    {ctxMenu.contextMenu.kind === 'connect' ? '只显示当前端口可以连接的节点' : '选择一个节点插入到画布'}
                  </div>
                </div>

                <div className="workflow-context-menu__category-strip">
                  {groupedNodeDefs.map((group) => (
                    <button
                      key={group.category}
                      type="button"
                      className={[
                        'workflow-context-menu__category-chip',
                        currentNodeCategory === group.category ? 'workflow-context-menu__category-chip--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => ctxMenu.setActiveCategory(group.category)}
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
        ))}

    </div>
  );
}

export default function FlowCanvas({ onViewportCenterChange }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner onViewportCenterChange={onViewportCenterChange} />
    </ReactFlowProvider>
  );
}
