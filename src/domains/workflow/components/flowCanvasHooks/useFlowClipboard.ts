import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  pushRootNodeOutsideGroupAreas,
} from '@/domains/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { CoordinateExtent, Node as FlowNodeType } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { buildClipboardSnapshot, snapValue } from '../flowCanvasClipboard';
import { FLOW_FORCE_DISABLED_NODE_TYPES } from '../flowCanvasConfig';
import { isEditableElement } from '../flowCanvasText';
import type { ClipboardSnapshot, ContextMenuState } from '../flowCanvasTypes';
import type { FlowHookDeps } from './types';

const WORKFLOW_NODE_CLIPBOARD_MARKER = 'suelr-studio/workflow-node-clipboard';

interface UseFlowClipboardDeps extends FlowHookDeps {
  addFilesToCanvas: (files: File[], position: { x: number; y: number }) => void;
  closeContextMenu: () => void;
  contextMenu: ContextMenuState | null;
  contextNodeIds: string[];
  getViewportCenterFlowPosition: () => { x: number; y: number };
  lastPointerFlowPositionRef: React.RefObject<{ x: number; y: number } | null>;
  renderNodes: FlowNodeType[];
  selectedNodeIds: string[];
}

export function useFlowClipboard({
  addFilesToCanvas,
  closeContextMenu,
  contextMenu,
  contextNodeIds,
  getViewportCenterFlowPosition,
  lastPointerFlowPositionRef,
  renderNodes,
  selectedNodeIds,
  store,
}: UseFlowClipboardDeps) {
  const [clipboardNode, setClipboardNode] = useState<ClipboardSnapshot | null>(null);

  const copyNodesToClipboard = useCallback(
    (nodeIds: string[], shouldCloseMenu = true) => {
      if (nodeIds.length === 0) return false;
      const snapshot = buildClipboardSnapshot(renderNodes, store.edges, nodeIds);
      if (!snapshot) return false;
      setClipboardNode(snapshot);
      void navigator.clipboard?.writeText(WORKFLOW_NODE_CLIPBOARD_MARKER).catch(() => undefined);
      if (shouldCloseMenu) closeContextMenu();
      return true;
    },
    [closeContextMenu, renderNodes, store.edges],
  );

  const copySelectedNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    copyNodesToClipboard([contextMenu.nodeId]);
  }, [contextMenu?.nodeId, copyNodesToClipboard]);

  const copyContextNodes = useCallback(() => {
    copyNodesToClipboard(contextNodeIds);
  }, [contextNodeIds, copyNodesToClipboard]);

  const pasteClipboardAtPosition = useCallback(
    (flowPosition: { x: number; y: number }) => {
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
        nodes: enforceGroupLayout([
          ...state.nodes.map((node) => ({ ...node, selected: false })),
          ...constrainedNextNodes,
        ]),
        edges: [...state.edges, ...nextEdges],
        selectedNodeId:
          constrainedNextNodes.find((node) => node.type === 'group')?.id || constrainedNextNodes[0]?.id || null,
        hasUnsavedChanges: true,
      }));
      closeContextMenu();
      return true;
    },
    [clipboardNode, closeContextMenu, renderNodes],
  );

  const pasteNodeAtContext = useCallback(() => {
    if (!contextMenu) return;
    pasteClipboardAtPosition(contextMenu.flowPosition);
  }, [contextMenu, pasteClipboardAtPosition]);

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
      }
    };

    window.addEventListener('keydown', handleClipboardHotkeys);
    return () => window.removeEventListener('keydown', handleClipboardHotkeys);
  }, [closeContextMenu, copyNodesToClipboard, selectedNodeIds]);

  useEffect(() => {
    const handleClipboardPaste = (event: ClipboardEvent) => {
      if (isEditableElement(event.target)) return;

      const clipboardText = event.clipboardData?.getData('text/plain') || '';
      const pastePosition =
        lastPointerFlowPositionRef.current ||
        (contextMenu && contextMenu.kind !== 'node' ? contextMenu.flowPosition : null) ||
        getViewportCenterFlowPosition();

      if (clipboardNode && clipboardText === WORKFLOW_NODE_CLIPBOARD_MARKER) {
        if (!pasteClipboardAtPosition(pastePosition)) return;
        event.preventDefault();
        return;
      }

      const pastedImageFiles = Array.from(event.clipboardData?.files || []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (pastedImageFiles.length === 0) {
        Array.from(event.clipboardData?.items || []).forEach((item) => {
          if (item.kind !== 'file' || !item.type.startsWith('image/')) return;
          const file = item.getAsFile();
          if (file) pastedImageFiles.push(file);
        });
      }

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
    lastPointerFlowPositionRef,
    pasteClipboardAtPosition,
  ]);

  return {
    clipboardNode,
    copyContextNodes,
    copySelectedNode,
    pasteNodeAtContext,
  };
}
