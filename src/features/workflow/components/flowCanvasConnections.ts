import type { Node as FlowNodeType } from '@xyflow/react';
import {
  getExpandedNodeOutputs,
  getNodeDef,
  PORT_COMPATIBILITY,
} from '@/features/workflow/lib/constants';
import {
  buildGroupHandleId,
  findGroupPort,
  isGroupPortExternallyConnectable,
  parseGroupHandleId,
} from '@/features/workflow/lib/groupPorts';

export function getParentId(node: FlowNodeType | undefined) {
  return (node as FlowNodeType & { parentId?: string } | undefined)?.parentId;
}

function getGroupPortType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || node.type !== 'group') return null;
  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor) return null;
  return findGroupPort((node.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId)?.type || null;
}

export function getOutputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return getGroupPortType(node, handleId);

  const def = getNodeDef(node.type || '');
  const outputs = def?.maxOutputs ? getExpandedNodeOutputs(node.type || '', (node.data || {}) as Record<string, unknown>) : def?.outputs;
  return outputs?.find((port) => port.id === handleId)?.type || null;
}

export function getInputType(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || !handleId) return null;
  if (node.type === 'group') return getGroupPortType(node, handleId);

  const def = getNodeDef(node.type || '');
  if (!def) return null;
  if (def.maxInputs) return def.inputs[0]?.type || null;
  return def.inputs.find((port) => port.id === handleId)?.type || null;
}

export function canConnectToGroupHandleExternally(node: FlowNodeType | undefined, handleId: string | null | undefined) {
  if (!node || node.type !== 'group' || !handleId) return false;
  const descriptor = parseGroupHandleId(handleId);
  if (!descriptor) return false;
  const port = findGroupPort((node.data || {}) as Record<string, unknown>, descriptor.side, descriptor.portId);
  return port ? isGroupPortExternallyConnectable(port) : false;
}

export function isNodeInsideGroup(node: FlowNodeType | undefined, groupId: string, nodeMap: Map<string, FlowNodeType>) {
  let current = node;
  while (current) {
    const parentId = getParentId(current);
    if (!parentId) return false;
    if (parentId === groupId) return true;
    current = nodeMap.get(parentId);
  }

  return false;
}

export function resolveDirectionalGroupConnection(
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

export function getVisibleCollapsedAncestorId(
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

export function getInputHandleCandidatesForNode(node: FlowNodeType) {
  const def = getNodeDef(node.type || '');
  if (!def) return [];
  if (def.maxInputs) return Array.from({ length: def.maxInputs }, (_, index) => `item${index + 1}`);
  return def.inputs.map((input) => input.id);
}

export function canNodeTypesConnect(sourceType: string | null, targetType: string | null) {
  if (!sourceType || !targetType) return false;
  return PORT_COMPATIBILITY[sourceType]?.includes(targetType) ?? false;
}
