import type { Edge, Node as FlowNodeType } from '@xyflow/react';
import { getNodeRenderRect } from './flowCanvasClipboard';

export function pointToSegmentDistance(
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

export function getEdgeApproximateSegment(
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

export function findCuttableEdgesAlongSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  nodes: FlowNodeType[],
  edges: Edge[],
  cutDistance: number,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.filter((edge) => {
    const segment = getEdgeApproximateSegment(edge, nodeMap);
    if (!segment) return false;

    return segmentToSegmentDistance(start, end, segment.start, segment.end) <= cutDistance;
  });
}
