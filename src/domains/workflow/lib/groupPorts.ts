import { getExpandedNodeOutputs, getNodeDef } from '@/domains/workflow/lib/constants';
import { gid } from '@/domains/workflow/lib/store/helpers';
import type { PortDataType } from '@/shared/workflow/types';
import type { Edge, Node } from '@xyflow/react';

export type GroupPortSide = 'input' | 'output';

export type GroupPortLink = {
  nodeId: string;
  handleId: string;
};

export type GroupPort = {
  id: string;
  label: string;
  type: PortDataType | null;
  insideLinks: GroupPortLink[];
  outsideLinks: GroupPortLink[];
};

export type GroupHandleDescriptor = {
  side: GroupPortSide;
  role: 'external' | 'internal' | null;
  portId: string;
};

type BoundaryPortBuildOptions = {
  ignoredNodeIds?: Set<string>;
};

const GROUP_HANDLE_PREFIX = 'group-port';

function getDefaultGroupPortLabel(side: GroupPortSide, index: number) {
  return side === 'input' ? `输入 ${index}` : `输出 ${index}`;
}

function getLinkKey(link: GroupPortLink | null | undefined) {
  return link ? `${link.nodeId}:${link.handleId}` : '';
}

export function getGroupPortBindingKey(link: GroupPortLink | null | undefined) {
  return getLinkKey(link);
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

function normalizePortLinkRecord(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.nodeId !== 'string' || typeof record.handleId !== 'string') return null;
  return {
    nodeId: record.nodeId,
    handleId: record.handleId,
  } satisfies GroupPortLink;
}

function normalizePortLinks(value: unknown, validNodeIds?: Set<string>) {
  const rawLinks = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const links: GroupPortLink[] = [];

  for (const rawLink of rawLinks) {
    const link = normalizePortLinkRecord(rawLink);
    if (!link) continue;
    if (validNodeIds && !validNodeIds.has(link.nodeId)) continue;

    const key = getLinkKey(link);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  return links;
}

function takeLimitedLinks(links: GroupPortLink[], limit: number) {
  return limit === Number.POSITIVE_INFINITY ? links : links.slice(0, limit);
}

function getPortTypeKey(type: PortDataType | null) {
  return type || 'any';
}

function getGroupPortChannelKey(side: GroupPortSide, port: GroupPort) {
  if (side === 'input') {
    const outsideKey = getLinkKey(port.outsideLinks[0]);
    const typeKey = getPortTypeKey(port.type);
    if (outsideKey) return `outside:${outsideKey}:${typeKey}`;
    return `inside:${port.insideLinks.map((link) => getLinkKey(link)).join(',')}:${typeKey}`;
  }

  const insideKey = getLinkKey(port.insideLinks[0]);
  const typeKey = getPortTypeKey(port.type);
  if (insideKey) return `inside:${insideKey}:${typeKey}`;
  return `outside:${port.outsideLinks.map((link) => getLinkKey(link)).join(',')}:${typeKey}`;
}

function getInsideLinkLimit(side: GroupPortSide) {
  return side === 'output' ? 1 : Number.POSITIVE_INFINITY;
}

function getOutsideLinkLimit(side: GroupPortSide) {
  return side === 'input' ? 1 : Number.POSITIVE_INFINITY;
}

function resolvePortTypeFromInsideLinks(side: GroupPortSide, links: GroupPortLink[], nodeMap?: Map<string, Node>) {
  if (!nodeMap || links.length === 0) return null;

  if (side === 'input') {
    const link = links[0];
    return getNodeHandleType(nodeMap.get(link.nodeId), link.handleId, 'input');
  }

  const link = links[0];
  return getNodeHandleType(nodeMap.get(link.nodeId), link.handleId, 'output');
}

function resolvePortLinksFromEdges(groupId: string, portId: string, side: GroupPortSide, edges: Edge[]) {
  const insideLinks: GroupPortLink[] = [];
  const outsideLinks: GroupPortLink[] = [];
  let matched = false;

  for (const edge of edges) {
    const sourceDescriptor = parseGroupHandleId(edge.sourceHandle);
    const targetDescriptor = parseGroupHandleId(edge.targetHandle);

    if (side === 'input') {
      if (
        edge.target === groupId &&
        targetDescriptor?.side === 'input' &&
        targetDescriptor.role === 'external' &&
        targetDescriptor.portId === portId &&
        edge.sourceHandle
      ) {
        matched = true;
        outsideLinks.push({
          nodeId: edge.source,
          handleId: edge.sourceHandle,
        });
      }

      if (
        edge.source === groupId &&
        sourceDescriptor?.side === 'input' &&
        sourceDescriptor.role === 'internal' &&
        sourceDescriptor.portId === portId &&
        edge.targetHandle
      ) {
        matched = true;
        insideLinks.push({
          nodeId: edge.target,
          handleId: edge.targetHandle,
        });
      }
      continue;
    }

    if (
      edge.target === groupId &&
      targetDescriptor?.side === 'output' &&
      targetDescriptor.role === 'internal' &&
      targetDescriptor.portId === portId &&
      edge.sourceHandle
    ) {
      matched = true;
      insideLinks.push({
        nodeId: edge.source,
        handleId: edge.sourceHandle,
      });
    }

    if (
      edge.source === groupId &&
      sourceDescriptor?.side === 'output' &&
      sourceDescriptor.role === 'external' &&
      sourceDescriptor.portId === portId &&
      edge.targetHandle
    ) {
      matched = true;
      outsideLinks.push({
        nodeId: edge.target,
        handleId: edge.targetHandle,
      });
    }
  }

  return {
    insideLinks,
    outsideLinks,
    matched,
  };
}

export function buildGroupHandleId(side: GroupPortSide, portId: string, role?: 'external' | 'internal') {
  return role ? `${GROUP_HANDLE_PREFIX}:${side}:${role}:${portId}` : `${GROUP_HANDLE_PREFIX}:${side}:${portId}`;
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

  const outputs = def.maxOutputs
    ? getExpandedNodeOutputs(node.type || '', (node.data || {}) as Record<string, unknown>)
    : def.outputs;
  return outputs.find((port) => port.id === handleId)?.type || null;
}

function createEmptyGroupPort(side: GroupPortSide, index: number): GroupPort {
  return {
    id: `group_port_${gid()}`,
    label: getDefaultGroupPortLabel(side, index),
    type: null,
    insideLinks: [],
    outsideLinks: [],
  };
}

function normalizeGroupPortRecord(value: unknown, side: GroupPortSide, index: number): GroupPort | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const legacyBinding = normalizePortLinkRecord(record.binding);

  return {
    id: normalizePortId(record.id),
    label: normalizePortLabel(record.label, side, index),
    type: typeof record.type === 'string' ? (record.type as PortDataType) : null,
    insideLinks: normalizePortLinks(record.insideLinks ?? (legacyBinding ? [legacyBinding] : [])),
    outsideLinks: normalizePortLinks(record.outsideLinks),
  };
}

function normalizeGroupPortListInternal(
  value: unknown,
  side: GroupPortSide,
  nodes?: Node[],
  groupId?: string,
  edges?: Edge[],
): GroupPort[] {
  const parsed = Array.isArray(value)
    ? value
        .map((item, index) => normalizeGroupPortRecord(item, side, index + 1))
        .filter((item): item is GroupPort => Boolean(item))
    : [];

  const descendantIds = nodes && groupId ? collectDescendantNodeIds(nodes, groupId) : null;
  const nodeMap = nodes ? new Map(nodes.map((node) => [node.id, node])) : null;
  const occupied: GroupPort[] = [];
  const occupiedKeys = new Set<string>();
  const empty: GroupPort[] = [];

  for (const parsedPort of parsed) {
    const derivedLinks = edges && groupId ? resolvePortLinksFromEdges(groupId, parsedPort.id, side, edges) : null;
    const resolvedInsideLinksSource = derivedLinks?.matched ? derivedLinks.insideLinks : parsedPort.insideLinks;
    const resolvedOutsideLinksSource = derivedLinks?.matched ? derivedLinks.outsideLinks : parsedPort.outsideLinks;

    const insideLinks = takeLimitedLinks(
      normalizePortLinks(resolvedInsideLinksSource, descendantIds || undefined),
      getInsideLinkLimit(side),
    );

    const outsideLinks = takeLimitedLinks(normalizePortLinks(resolvedOutsideLinksSource), getOutsideLinkLimit(side));

    const resolvedType = resolvePortTypeFromInsideLinks(side, insideLinks, nodeMap || undefined);
    const hasLinks = insideLinks.length > 0 || outsideLinks.length > 0;
    const nextPort: GroupPort = {
      ...parsedPort,
      label: normalizePortLabel(parsedPort.label, side, occupied.length + empty.length + 1),
      type: hasLinks ? resolvedType || parsedPort.type || null : null,
      insideLinks,
      outsideLinks,
    };

    if (!hasLinks) {
      empty.push({
        ...nextPort,
        type: null,
        insideLinks: [],
        outsideLinks: [],
      });
      continue;
    }

    const occupiedKey = getGroupPortChannelKey(side, nextPort);
    if (occupiedKeys.has(occupiedKey)) {
      continue;
    }

    occupiedKeys.add(occupiedKey);
    occupied.push(nextPort);
  }

  const trailing = empty[0]
    ? {
        ...empty[0],
        label: normalizePortLabel(empty[0].label, side, occupied.length + 1),
        type: null,
        insideLinks: [],
        outsideLinks: [],
      }
    : createEmptyGroupPort(side, occupied.length + 1);

  return [...occupied, trailing];
}

export function getGroupPorts(data: Record<string, unknown>, side: GroupPortSide) {
  return normalizeGroupPortListInternal(side === 'input' ? data.groupInputs : data.groupOutputs, side);
}

export function updateGroupPortList(
  data: Record<string, unknown>,
  side: GroupPortSide,
  updater: (ports: GroupPort[]) => GroupPort[],
) {
  const current = getGroupPorts(data, side);
  const next = normalizeGroupPortListInternal(updater(current), side);
  return side === 'input' ? { groupInputs: next } : { groupOutputs: next };
}

function shouldIgnoreBoundaryEdge(edge: Edge, options?: BoundaryPortBuildOptions) {
  const ignoredNodeIds = options?.ignoredNodeIds;
  if (!ignoredNodeIds || ignoredNodeIds.size === 0) return false;
  return ignoredNodeIds.has(edge.source) || ignoredNodeIds.has(edge.target);
}

function buildAutoExposedInputPorts(
  nodes: Node[],
  edges: Edge[],
  selectedIds: Set<string>,
  options?: BoundaryPortBuildOptions,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, GroupPort>();

  for (const edge of edges) {
    if (shouldIgnoreBoundaryEdge(edge, options)) continue;
    if (selectedIds.has(edge.source) || !selectedIds.has(edge.target) || !edge.sourceHandle || !edge.targetHandle)
      continue;

    const targetType = getNodeHandleType(nodeMap.get(edge.target), edge.targetHandle, 'input');
    if (!targetType) continue;

    const key = `${edge.source}:${edge.sourceHandle}:${targetType}`;
    const current =
      groups.get(key) ||
      ({
        id: `group_port_${gid()}`,
        label: getDefaultGroupPortLabel('input', groups.size + 1),
        type: targetType,
        insideLinks: [],
        outsideLinks: [{ nodeId: edge.source, handleId: edge.sourceHandle }],
      } satisfies GroupPort);

    current.insideLinks = normalizePortLinks([
      ...current.insideLinks,
      { nodeId: edge.target, handleId: edge.targetHandle },
    ]);
    groups.set(key, current);
  }

  return normalizeGroupPortListInternal([...groups.values()], 'input');
}

function buildAutoExposedOutputPorts(
  nodes: Node[],
  edges: Edge[],
  selectedIds: Set<string>,
  options?: BoundaryPortBuildOptions,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, GroupPort>();

  for (const edge of edges) {
    if (shouldIgnoreBoundaryEdge(edge, options)) continue;
    if (!selectedIds.has(edge.source) || selectedIds.has(edge.target) || !edge.sourceHandle || !edge.targetHandle)
      continue;

    const sourceType = getNodeHandleType(nodeMap.get(edge.source), edge.sourceHandle, 'output');
    if (!sourceType) continue;

    const key = `${edge.source}:${edge.sourceHandle}:${sourceType}`;
    const current =
      groups.get(key) ||
      ({
        id: `group_port_${gid()}`,
        label: getDefaultGroupPortLabel('output', groups.size + 1),
        type: sourceType,
        insideLinks: [{ nodeId: edge.source, handleId: edge.sourceHandle }],
        outsideLinks: [],
      } satisfies GroupPort);

    current.outsideLinks = normalizePortLinks([
      ...current.outsideLinks,
      { nodeId: edge.target, handleId: edge.targetHandle },
    ]);
    groups.set(key, current);
  }

  return normalizeGroupPortListInternal([...groups.values()], 'output');
}

export function buildGroupPortsFromBoundaryEdges(
  nodes: Node[],
  edges: Edge[],
  nodeIds: string[],
  options?: BoundaryPortBuildOptions,
) {
  const selectedIds = new Set(nodeIds);
  return {
    groupInputs: buildAutoExposedInputPorts(nodes, edges, selectedIds, options),
    groupOutputs: buildAutoExposedOutputPorts(nodes, edges, selectedIds, options),
  };
}

export function getGroupPortPrimaryInsideLink(port: GroupPort) {
  return port.insideLinks[0] || null;
}

export function getGroupPortPrimaryOutsideLink(port: GroupPort) {
  return port.outsideLinks[0] || null;
}

export function isGroupPortEmpty(port: GroupPort) {
  return port.insideLinks.length === 0 && port.outsideLinks.length === 0;
}

export function isGroupPortExternallyConnectable(port: GroupPort) {
  if (!port.type) return false;
  return port.insideLinks.length > 0;
}

export function findGroupPort(data: Record<string, unknown>, side: GroupPortSide, portId: string) {
  return getGroupPorts(data, side).find((port) => port.id === portId) || null;
}

export function findGroupPortByLink(
  data: Record<string, unknown>,
  side: GroupPortSide,
  location: 'inside' | 'outside',
  link: GroupPortLink | null | undefined,
) {
  const linkKey = getLinkKey(link);
  if (!linkKey) return null;

  return (
    getGroupPorts(data, side).find((port) =>
      (location === 'inside' ? port.insideLinks : port.outsideLinks).some(
        (portLink) => getLinkKey(portLink) === linkKey,
      ),
    ) || null
  );
}

export function findGroupPortByBinding(
  data: Record<string, unknown>,
  side: GroupPortSide,
  link: GroupPortLink | null | undefined,
) {
  return findGroupPortByLink(data, side, 'inside', link);
}

export function normalizeGroupPortNodes(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    if (node.type !== 'group') return node;

    const descendantIds = [...collectDescendantNodeIds(nodes, node.id)];
    const autoPorts = buildGroupPortsFromBoundaryEdges(nodes, edges, descendantIds, {
      ignoredNodeIds: new Set([node.id]),
    });
    const mergeAutoExposedPorts = (side: GroupPortSide, currentValue: unknown, autoValue: unknown) => {
      const currentPorts = normalizeGroupPortListInternal(currentValue, side, nodes, node.id, edges);
      const autoPortsForSide = normalizeGroupPortListInternal(autoValue, side).filter(
        (port) => !isGroupPortEmpty(port),
      );
      const seenInsideLinks = new Set(
        currentPorts.flatMap((port) => port.insideLinks.map((link) => getLinkKey(link))).filter(Boolean),
      );
      const nextPorts = [...currentPorts];

      for (const port of autoPortsForSide) {
        const key = getLinkKey(port.insideLinks[0]);
        if (!key || seenInsideLinks.has(key)) continue;
        nextPorts.splice(Math.max(0, nextPorts.length - 1), 0, port);
        seenInsideLinks.add(key);
      }

      return normalizeGroupPortListInternal(nextPorts, side, nodes, node.id, edges);
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
        (sourceDescriptor.side === 'input' && sourceDescriptor.role !== 'internal') ||
        (sourceDescriptor.side === 'output' && sourceDescriptor.role !== 'external')
      ) {
        return false;
      }

      const sourcePort = findGroupPort(
        (sourceNode.data || {}) as Record<string, unknown>,
        sourceDescriptor.side,
        sourceDescriptor.portId,
      );
      if (!sourcePort) return false;

      if (sourceDescriptor.side === 'input') {
        return sourcePort.insideLinks.some(
          (link) => edge.target === link.nodeId && edge.targetHandle === link.handleId,
        );
      }

      return sourcePort.outsideLinks.some((link) => edge.target === link.nodeId && edge.targetHandle === link.handleId);
    }

    if (targetDescriptor) {
      if (targetNode?.type !== 'group') {
        return false;
      }

      if (
        (targetDescriptor.side === 'input' && targetDescriptor.role !== 'external') ||
        (targetDescriptor.side === 'output' && targetDescriptor.role !== 'internal')
      ) {
        return false;
      }

      const targetPort = findGroupPort(
        (targetNode.data || {}) as Record<string, unknown>,
        targetDescriptor.side,
        targetDescriptor.portId,
      );
      if (!targetPort) return false;

      if (targetDescriptor.side === 'input') {
        return targetPort.outsideLinks.some(
          (link) => edge.source === link.nodeId && edge.sourceHandle === link.handleId,
        );
      }

      return targetPort.insideLinks.some((link) => edge.source === link.nodeId && edge.sourceHandle === link.handleId);
    }

    return true;
  });
}
