import type { Edge, Node } from '@xyflow/react';
import { PORT_COMPATIBILITY, getNodeDef } from '@/domains/workflow/lib/constants';
import { getNodeHandleType, parseGroupHandleId } from '@/domains/workflow/lib/groupPorts';
import { gid } from '@/domains/workflow/lib/store/helpers';

function getPortOrder(node: Node | undefined, handleId: string | null | undefined, side: 'input' | 'output') {
  if (!node || !handleId) return Number.MAX_SAFE_INTEGER;
  const def = getNodeDef(node.type || '');
  if (!def) return Number.MAX_SAFE_INTEGER;

  if (side === 'input' && def.maxInputs) {
    const inputIndex = Number.parseInt(handleId.replace('item', ''), 10);
    return Number.isFinite(inputIndex) ? inputIndex - 1 : Number.MAX_SAFE_INTEGER;
  }

  const ports = side === 'input' ? def.inputs : def.outputs;
  const index = ports.findIndex((port) => port.id === handleId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function arePortsCompatible(
  nodeMap: Map<string, Node>,
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string,
  targetHandle: string | null | undefined,
) {
  if (!sourceHandle || !targetHandle) return false;
  if (parseGroupHandleId(sourceHandle) || parseGroupHandleId(targetHandle)) return false;

  const sourceType = getNodeHandleType(nodeMap.get(sourceId), sourceHandle, 'output');
  const targetType = getNodeHandleType(nodeMap.get(targetId), targetHandle, 'input');
  if (!sourceType || !targetType) return false;

  return PORT_COMPATIBILITY[sourceType]?.includes(targetType) ?? false;
}

function createEdgeKey(edge: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>) {
  return [
    edge.source,
    edge.sourceHandle || '',
    edge.target,
    edge.targetHandle || '',
  ].join('|');
}

function getInputHandleCandidates(node: Node | undefined) {
  const def = getNodeDef(node?.type || '');
  if (!def || !node) return [];

  if (def.maxInputs) {
    return Array.from({ length: def.maxInputs }, (_, index) => `item${index + 1}`);
  }

  return def.inputs.map((input) => input.id);
}

function getOutputHandleCandidates(node: Node | undefined) {
  const def = getNodeDef(node?.type || '');
  return def?.outputs.map((output) => output.id) || [];
}

export function buildBypassEdgesForNode(nodes: Node[], edges: Edge[], nodeId: string, remainingEdges: Edge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const removedNode = nodeMap.get(nodeId);
  if (!removedNode || removedNode.type === 'group') return [];

  const incomingEdges = edges
    .filter((edge) => edge.target === nodeId && edge.source !== nodeId)
    .sort((a, b) => (
      getPortOrder(removedNode, a.targetHandle, 'input') - getPortOrder(removedNode, b.targetHandle, 'input')
    ));
  const outgoingEdges = edges
    .filter((edge) => edge.source === nodeId && edge.target !== nodeId)
    .sort((a, b) => (
      getPortOrder(removedNode, a.sourceHandle, 'output') - getPortOrder(removedNode, b.sourceHandle, 'output')
        || getPortOrder(nodeMap.get(a.target), a.targetHandle, 'input') - getPortOrder(nodeMap.get(b.target), b.targetHandle, 'input')
    ));

  if (incomingEdges.length === 0 || outgoingEdges.length === 0) return [];

  const occupiedTargetHandles = new Set(
    remainingEdges
      .filter((edge) => edge.targetHandle)
      .map((edge) => `${edge.target}:${edge.targetHandle}`),
  );
  const existingEdgeKeys = new Set(remainingEdges.map((edge) => createEdgeKey(edge)));
  const bypassEdges: Edge[] = [];

  for (const outgoingEdge of outgoingEdges) {
    if (!outgoingEdge.targetHandle) continue;
    const targetKey = `${outgoingEdge.target}:${outgoingEdge.targetHandle}`;
    if (occupiedTargetHandles.has(targetKey)) continue;

    const incomingEdge = incomingEdges.find((candidate) => (
      candidate.sourceHandle
      && candidate.source !== outgoingEdge.target
      && arePortsCompatible(
        nodeMap,
        candidate.source,
        candidate.sourceHandle,
        outgoingEdge.target,
        outgoingEdge.targetHandle,
      )
    ));
    if (!incomingEdge || !incomingEdge.sourceHandle) continue;

    const nextEdge: Edge = {
      id: `edge_${gid()}`,
      source: incomingEdge.source,
      sourceHandle: incomingEdge.sourceHandle,
      target: outgoingEdge.target,
      targetHandle: outgoingEdge.targetHandle,
      type: 'default',
      animated: false,
      style: { strokeWidth: 2 },
    };
    const edgeKey = createEdgeKey(nextEdge);
    if (existingEdgeKeys.has(edgeKey)) continue;

    occupiedTargetHandles.add(targetKey);
    existingEdgeKeys.add(edgeKey);
    bypassEdges.push(nextEdge);
  }

  return bypassEdges;
}

export function buildInsertionEdgesForNode(nodes: Node[], edges: Edge[], nodeId: string, edgeId: string) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const insertedNode = nodeMap.get(nodeId);
  const replacedEdge = edges.find((edge) => edge.id === edgeId);
  if (!insertedNode || insertedNode.type === 'group' || !replacedEdge) return null;
  if (replacedEdge.source === nodeId || replacedEdge.target === nodeId) return null;
  if (!replacedEdge.sourceHandle || !replacedEdge.targetHandle) return null;
  if (parseGroupHandleId(replacedEdge.sourceHandle) || parseGroupHandleId(replacedEdge.targetHandle)) return null;

  const remainingEdges = edges.filter((edge) => edge.id !== edgeId);
  const occupiedTargetHandles = new Set(
    remainingEdges
      .filter((edge) => edge.targetHandle)
      .map((edge) => `${edge.target}:${edge.targetHandle}`),
  );
  const existingEdgeKeys = new Set(remainingEdges.map((edge) => createEdgeKey(edge)));

  const inputHandle = getInputHandleCandidates(insertedNode)
    .sort((a, b) => getPortOrder(insertedNode, a, 'input') - getPortOrder(insertedNode, b, 'input'))
    .find((candidate) => (
      !occupiedTargetHandles.has(`${nodeId}:${candidate}`)
      && arePortsCompatible(nodeMap, replacedEdge.source, replacedEdge.sourceHandle, nodeId, candidate)
    ));
  if (!inputHandle) return null;

  const outputHandle = getOutputHandleCandidates(insertedNode)
    .sort((a, b) => getPortOrder(insertedNode, a, 'output') - getPortOrder(insertedNode, b, 'output'))
    .find((candidate) => (
      arePortsCompatible(nodeMap, nodeId, candidate, replacedEdge.target, replacedEdge.targetHandle)
    ));
  if (!outputHandle) return null;

  const incomingEdge: Edge = {
    id: `edge_${gid()}`,
    source: replacedEdge.source,
    sourceHandle: replacedEdge.sourceHandle,
    target: nodeId,
    targetHandle: inputHandle,
    type: 'default',
    animated: false,
    style: { strokeWidth: 2 },
  };
  const outgoingEdge: Edge = {
    id: `edge_${gid()}`,
    source: nodeId,
    sourceHandle: outputHandle,
    target: replacedEdge.target,
    targetHandle: replacedEdge.targetHandle,
    type: 'default',
    animated: false,
    style: { strokeWidth: 2 },
  };

  if (existingEdgeKeys.has(createEdgeKey(incomingEdge)) || existingEdgeKeys.has(createEdgeKey(outgoingEdge))) {
    return null;
  }

  return [...remainingEdges, incomingEdge, outgoingEdge];
}
