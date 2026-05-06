import type { Edge, Node } from '@xyflow/react';
import { getNodeDef } from '@/features/workflow/lib/constants';
import { gid } from '@/features/workflow/lib/store/helpers';
import type { PortDataType } from '@/shared/workflow/types';

export type GroupPortSide = 'input' | 'output';

export type GroupPortBinding = {
  nodeId: string;
  handleId: string;
};

export type GroupPort = {
  id: string;
  label: string;
  type: PortDataType | null;
  binding: GroupPortBinding | null;
};

export type GroupHandleDescriptor = {
  side: GroupPortSide;
  role: 'external' | 'internal' | null;
  portId: string;
};

const GROUP_HANDLE_PREFIX = 'group-port';
function getDefaultGroupPortLabel(side: GroupPortSide, index: number) {
  return side === 'input' ? `输入 ${index}` : `输出 ${index}`;
}

function getBindingKey(binding: GroupPortBinding | null | undefined) {
  return binding ? `${binding.nodeId}:${binding.handleId}` : '';
}

export function getGroupPortBindingKey(binding: GroupPortBinding | null | undefined) {
  return getBindingKey(binding);
}

function normalizePortLabel(label: unknown, side: GroupPortSide, index: number) {
  const text = typeof label === 'string' ? label.trim() : '';
  return text || getDefaultGroupPortLabel(side, index);
}

function normalizePortId(portId: unknown) {
  return typeof portId === 'string' && portId.trim() ? portId : `group_port_${gid()}`;
}

function getNodeParentId(node: Node) {
  return (node as Node & { parentId?: string }).parentId;
}

export function buildGroupHandleId(
  side: GroupPortSide,
  portId: string,
  role?: 'external' | 'internal',
) {
  return role
    ? `${GROUP_HANDLE_PREFIX}:${side}:${role}:${portId}`
    : `${GROUP_HANDLE_PREFIX}:${side}:${portId}`;
}

export function parseGroupHandleId(handleId: string | null | undefined): GroupHandleDescriptor | null {
  if (!handleId) return null;
  const [prefix, side, next, ...rest] = handleId.split(':');
  if (prefix !== GROUP_HANDLE_PREFIX || !next) return null;

  if (side !== 'input' && side !== 'output') return null;

  if (next === 'external' || next === 'internal') {
    const portId = rest.join(':');
    return { side, role: next, portId };
  }

  return { side, role: null, portId: [next, ...rest].join(':') };
}

export function collectDescendantNodeIds(nodes: Node[], groupId: string) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = getNodeParentId(node);
    if (!parentId) continue;
    const current = byParent.get(parentId) || [];
    current.push(node.id);
    byParent.set(parentId, current);
  }

  const visited = new Set<string>();
  const queue = [groupId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;

    for (const childId of byParent.get(currentId) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return visited;
}

export function isNodeInsideGroup(nodes: Node[], groupId: string, nodeId: string) {
  return collectDescendantNodeIds(nodes, groupId).has(nodeId);
}

export function getNodeHandleType(
  node: Node | undefined,
  handleId: string | null | undefined,
  side: GroupPortSide,
): PortDataType | null {
  if (!node || !handleId) return null;

  const def = getNodeDef(node.type || '');
  if (!def) return null;

  if (side === 'input') {
    if (def.maxInputs) {
      return def.inputs[0]?.type || null;
    }
    return def.inputs.find((port) => port.id === handleId)?.type || null;
  }

  return def.outputs.find((port) => port.id === handleId)?.type || null;
}

function createEmptyGroupPort(side: GroupPortSide, index: number): GroupPort {
  return {
    id: `group_port_${gid()}`,
    label: getDefaultGroupPortLabel(side, index),
    type: null,
    binding: null,
  };
}

function normalizeGroupPortRecord(
  value: unknown,
  side: GroupPortSide,
  index: number,
): GroupPort | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const bindingRecord = record.binding && typeof record.binding === 'object'
    ? record.binding as Record<string, unknown>
    : null;

  const binding = bindingRecord
    && typeof bindingRecord.nodeId === 'string'
    && typeof bindingRecord.handleId === 'string'
    ? {
        nodeId: bindingRecord.nodeId,
        handleId: bindingRecord.handleId,
      } satisfies GroupPortBinding
    : null;

  return {
    id: normalizePortId(record.id),
    label: normalizePortLabel(record.label, side, index),
    type: typeof record.type === 'string' ? record.type as PortDataType : null,
    binding,
  };
}

function normalizeGroupPortListInternal(
  value: unknown,
  side: GroupPortSide,
  nodes?: Node[],
  groupId?: string,
): GroupPort[] {
  const parsed = Array.isArray(value)
    ? value
        .map((item, index) => normalizeGroupPortRecord(item, side, index + 1))
        .filter((item): item is GroupPort => Boolean(item))
    : [];

  const descendantIds = nodes && groupId ? collectDescendantNodeIds(nodes, groupId) : null;
  const nodeMap = nodes ? new Map(nodes.map((node) => [node.id, node])) : null;
  const seenBindings = new Set<string>();
  const occupied: GroupPort[] = [];
  const empty: GroupPort[] = [];

  for (const port of parsed) {
    if (!port.binding) {
      empty.push({
        ...port,
        label: normalizePortLabel(port.label, side, occupied.length + empty.length + 1),
        type: null,
        binding: null,
      });
      continue;
    }

    if (descendantIds && !descendantIds.has(port.binding.nodeId)) continue;

    const bindingKey = getBindingKey(port.binding);
    if (!bindingKey || seenBindings.has(bindingKey)) continue;

    const resolvedType = nodeMap
      ? getNodeHandleType(nodeMap.get(port.binding.nodeId), port.binding.handleId, side)
      : null;

    if (nodeMap && !resolvedType) continue;

    seenBindings.add(bindingKey);
    occupied.push({
      ...port,
      label: normalizePortLabel(port.label, side, occupied.length + 1),
      type: resolvedType || port.type || null,
    });
  }

  const trailing = empty[0]
    ? {
      ...empty[0],
      label: normalizePortLabel(empty[0].label, side, occupied.length + 1),
      type: null,
      binding: null,
    }
    : createEmptyGroupPort(side, occupied.length + 1);

  return [...occupied, trailing];
}

export function getGroupPorts(data: Record<string, unknown>, side: GroupPortSide) {
  return normalizeGroupPortListInternal(
    side === 'input' ? data.groupInputs : data.groupOutputs,
    side,
  );
}

export function updateGroupPortList(
  data: Record<string, unknown>,
  side: GroupPortSide,
  updater: (ports: GroupPort[]) => GroupPort[],
) {
  const current = getGroupPorts(data, side);
  const next = normalizeGroupPortListInternal(updater(current), side);
  return side === 'input'
    ? { groupInputs: next }
    : { groupOutputs: next };
}

export function normalizeGroupPortNodes(nodes: Node[], _edges: Edge[]) {
  return nodes.map((node) => {
    if (node.type !== 'group') return node;

    const descendantIds = [...collectDescendantNodeIds(nodes, node.id)];
    const autoPorts = buildGroupPortsFromBoundaryEdges(nodes, _edges, descendantIds);
    const mergeAutoExposedPorts = (side: GroupPortSide, currentValue: unknown, autoValue: unknown) => {
      const currentPorts = normalizeGroupPortListInternal(currentValue, side, nodes, node.id);
      const autoPortsForSide = normalizeGroupPortListInternal(autoValue, side, nodes, node.id).filter((port) => port.binding);
      const seenBindings = new Set(
        currentPorts
          .map((port) => getBindingKey(port.binding))
          .filter(Boolean),
      );
      const nextPorts = [...currentPorts];

      for (const port of autoPortsForSide) {
        const bindingKey = getBindingKey(port.binding);
        if (!bindingKey || seenBindings.has(bindingKey)) continue;
        nextPorts.splice(Math.max(0, nextPorts.length - 1), 0, port);
        seenBindings.add(bindingKey);
      }

      return normalizeGroupPortListInternal(nextPorts, side, nodes, node.id);
    };

    const groupInputs = mergeAutoExposedPorts('input', node.data?.groupInputs, autoPorts.groupInputs);
    const groupOutputs = mergeAutoExposedPorts('output', node.data?.groupOutputs, autoPorts.groupOutputs);

    return {
      ...node,
      data: {
        ...node.data,
        groupInputs,
        groupOutputs,
      },
    };
  });
}

function buildAutoExposedInputPorts(nodes: Node[], edges: Edge[], selectedIds: Set<string>) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const ports: GroupPort[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (selectedIds.has(edge.source) || !selectedIds.has(edge.target) || !edge.targetHandle) continue;

    const binding: GroupPortBinding = {
      nodeId: edge.target,
      handleId: edge.targetHandle,
    };
    const bindingKey = getBindingKey(binding);
    if (seen.has(bindingKey)) continue;

    seen.add(bindingKey);
    ports.push({
      id: `group_port_${gid()}`,
      label: getDefaultGroupPortLabel('input', ports.length + 1),
      type: getNodeHandleType(nodeMap.get(edge.target), edge.targetHandle, 'input') || null,
      binding,
    });
  }

  return normalizeGroupPortListInternal(ports, 'input');
}

function buildAutoExposedOutputPorts(nodes: Node[], edges: Edge[], selectedIds: Set<string>) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const ports: GroupPort[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (!selectedIds.has(edge.source) || selectedIds.has(edge.target) || !edge.sourceHandle) continue;

    const binding: GroupPortBinding = {
      nodeId: edge.source,
      handleId: edge.sourceHandle,
    };
    const bindingKey = getBindingKey(binding);
    if (seen.has(bindingKey)) continue;

    seen.add(bindingKey);
    ports.push({
      id: `group_port_${gid()}`,
      label: getDefaultGroupPortLabel('output', ports.length + 1),
      type: getNodeHandleType(nodeMap.get(edge.source), edge.sourceHandle, 'output') || null,
      binding,
    });
  }

  return normalizeGroupPortListInternal(ports, 'output');
}

export function buildGroupPortsFromBoundaryEdges(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const selectedIds = new Set(nodeIds);
  return {
    groupInputs: buildAutoExposedInputPorts(nodes, edges, selectedIds),
    groupOutputs: buildAutoExposedOutputPorts(nodes, edges, selectedIds),
  };
}

export function findGroupPort(data: Record<string, unknown>, side: GroupPortSide, portId: string) {
  return getGroupPorts(data, side).find((port) => port.id === portId) || null;
}

export function findGroupPortByBinding(
  data: Record<string, unknown>,
  side: GroupPortSide,
  binding: GroupPortBinding | null | undefined,
) {
  const bindingKey = getBindingKey(binding);
  if (!bindingKey) return null;
  return getGroupPorts(data, side).find((port) => getBindingKey(port.binding) === bindingKey) || null;
}

export function pruneGroupPortEdges(nodes: Node[], edges: Edge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return edges.filter((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const sourceDescriptor = parseGroupHandleId(edge.sourceHandle);
    const targetDescriptor = parseGroupHandleId(edge.targetHandle);

    if (sourceDescriptor) {
      if (sourceNode?.type !== 'group') {
        return false;
      }
      if (
        (sourceDescriptor.side === 'input' && sourceDescriptor.role !== 'internal')
        || (sourceDescriptor.side === 'output' && sourceDescriptor.role !== 'external')
      ) {
        return false;
      }
      const sourcePort = findGroupPort(
        (sourceNode.data || {}) as Record<string, unknown>,
        sourceDescriptor.side,
        sourceDescriptor.portId,
      );
      if (!sourcePort?.binding) return false;
      if (
        sourceDescriptor.side === 'input'
        && (edge.target !== sourcePort.binding.nodeId || edge.targetHandle !== sourcePort.binding.handleId)
      ) {
        return false;
      }
    }

    if (targetDescriptor) {
      if (targetNode?.type !== 'group') {
        return false;
      }
      if (
        (targetDescriptor.side === 'input' && targetDescriptor.role !== 'external')
        || (targetDescriptor.side === 'output' && targetDescriptor.role !== 'internal')
      ) {
        return false;
      }
      const targetPort = findGroupPort(
        (targetNode.data || {}) as Record<string, unknown>,
        targetDescriptor.side,
        targetDescriptor.portId,
      );
      if (!targetPort?.binding) return false;
      if (
        targetDescriptor.side === 'output'
        && (edge.source !== targetPort.binding.nodeId || edge.sourceHandle !== targetPort.binding.handleId)
      ) {
        return false;
      }
    }

    return true;
  });
}
