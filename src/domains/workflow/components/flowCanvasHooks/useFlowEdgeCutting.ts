import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { findCuttableEdgesAlongSegment } from '../flowCanvasGeometry';
import { isEditableElement } from '../flowCanvasText';
import type { FlowHookDeps } from './types';

interface UseFlowEdgeCuttingDeps extends FlowHookDeps {
  closeContextMenu: () => void;
  renderEdges: Edge[];
  renderNodes: FlowNodeType[];
}

export function useFlowEdgeCutting({
  closeContextMenu,
  reactFlow,
  renderEdges,
  renderNodes,
  store,
}: UseFlowEdgeCuttingDeps) {
  const [edgeCuttingActive, setEdgeCuttingActive] = useState(false);
  const edgeCutPreviousPointRef = useRef<{ x: number; y: number } | null>(null);
  const edgeCutRemovedIdsRef = useRef<Set<string>>(new Set());

  const resolveRenderableEdgeId = useCallback(
    (edge: Edge) => {
      if (edge.id.startsWith('virtual:')) {
        return edge.id.slice('virtual:'.length);
      }

      if (edge.id.startsWith('group-binding:')) {
        return (
          store.edges.find(
            (candidate) =>
              candidate.source === edge.source &&
              candidate.sourceHandle === edge.sourceHandle &&
              candidate.target === edge.target &&
              candidate.targetHandle === edge.targetHandle,
          )?.id || null
        );
      }

      return edge.id;
    },
    [store.edges],
  );

  const endEdgeCutting = useCallback(() => {
    edgeCutPreviousPointRef.current = null;
    edgeCutRemovedIdsRef.current.clear();
    setEdgeCuttingActive(false);
  }, []);

  const cutEdgesAlongPointerSegment = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const cuttableEdges = findCuttableEdgesAlongSegment(start, end, renderNodes, renderEdges, 14);

      for (const edge of cuttableEdges) {
        const edgeId = resolveRenderableEdgeId(edge);
        if (!edgeId || edgeCutRemovedIdsRef.current.has(edgeId)) continue;
        edgeCutRemovedIdsRef.current.add(edgeId);
        store.removeEdge(edgeId);
      }
    },
    [renderEdges, renderNodes, resolveRenderableEdgeId, store],
  );

  const getPointerFlowPosition = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
      reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    [reactFlow],
  );

  const onCanvasPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.altKey || event.button !== 0 || isEditableElement(event.target)) return;

      const position = getPointerFlowPosition(event);
      edgeCutPreviousPointRef.current = position;
      edgeCutRemovedIdsRef.current.clear();
      setEdgeCuttingActive(true);
      closeContextMenu();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    [closeContextMenu, getPointerFlowPosition],
  );

  const onCanvasPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    },
    [cutEdgesAlongPointerSegment, edgeCuttingActive, endEdgeCutting, getPointerFlowPosition],
  );

  const onCanvasPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!edgeCuttingActive) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endEdgeCutting();
      event.preventDefault();
      event.stopPropagation();
    },
    [edgeCuttingActive, endEdgeCutting],
  );

  return {
    edgeCuttingActive,
    onCanvasPointerDownCapture,
    onCanvasPointerMoveCapture,
    onCanvasPointerUpCapture,
  };
}
