import type { NodeMouseHandler } from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { FLOW_CATEGORY_ORDER } from '../flowCanvasConfig';
import type { ContextMenuKind, ContextMenuState } from '../flowCanvasTypes';
import { getContextMenuLayout, getLocalPoint, isPaneBackgroundTarget } from '../flowCanvasUiHelpers';
import type { FlowHookDeps } from './types';

interface UseFlowContextMenuDeps extends FlowHookDeps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function useFlowContextMenu({ containerRef, reactFlow, store }: UseFlowContextMenuDeps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof FLOW_CATEGORY_ORDER)[number] | null>(null);
  const contextMenuOpenedAtRef = useRef(0);

  const wasContextMenuJustOpened = useCallback(() => Date.now() - contextMenuOpenedAtRef.current < 150, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setActiveCategory(null);
  }, []);

  const openContextMenuAtScreenPoint = useCallback(
    (kind: ContextMenuKind, point: { x: number; y: number }, extras?: Partial<ContextMenuState>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const localX = rect ? point.x - rect.left : point.x;
      const localY = rect ? point.y - rect.top : point.y;
      const flowPosition = reactFlow.screenToFlowPosition({ x: point.x, y: point.y });
      const layout = getContextMenuLayout(kind, containerRef.current, localX, localY);
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
    },
    [containerRef, reactFlow],
  );

  const openContextMenuAtPoint = useCallback(
    (kind: ContextMenuKind, event: MouseEvent | TouchEvent | ReactMouseEvent, extras?: Partial<ContextMenuState>) => {
      const point = getLocalPoint(event, containerRef.current);
      openContextMenuAtScreenPoint(kind, { x: point.clientX, y: point.clientY }, extras);
    },
    [containerRef, openContextMenuAtScreenPoint],
  );

  const onNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      store.selectNode(node.id);
      const selectedIds = store.nodes.filter((item) => item.selected).map((item) => item.id);
      const nextSelectedIds = selectedIds.includes(node.id) && selectedIds.length > 1 ? selectedIds : [node.id];
      openContextMenuAtPoint('node', event, { nodeId: node.id, selectedNodeIds: nextSelectedIds });
    },
    [openContextMenuAtPoint, store],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const selectedIds = store.nodes.filter((item) => item.selected).map((item) => item.id);
      if (selectedIds.length > 0) {
        openContextMenuAtPoint('node', event, { selectedNodeIds: selectedIds });
        return;
      }

      store.selectNode(null);
      openContextMenuAtPoint('paneActions', event);
    },
    [openContextMenuAtPoint, store],
  );

  const onPaneDoubleClickOpenMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (!isPaneBackgroundTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      window.getSelection()?.removeAllRanges();
      store.selectNode(null);
      openContextMenuAtPoint('pane', event);
    },
    [openContextMenuAtPoint, store],
  );

  return {
    activeCategory,
    closeContextMenu,
    contextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
    onPaneDoubleClickOpenMenu,
    openContextMenuAtPoint,
    openContextMenuAtScreenPoint,
    setActiveCategory,
    wasContextMenuJustOpened,
  };
}
