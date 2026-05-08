import type { Edge, Node } from '@xyflow/react';
import {
  DEFAULT_WORKFLOW_NAME,
  getNodeAutoExpandedSize,
  getNodeDefaultSize,
  getNodeOutputCount,
  GRID_SIZE,
  NODE_REGISTRY,
} from '@/features/workflow/lib/constants';
import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  getEffectiveNodeSize,
  getGroupContentBounds,
  GROUP_CONTENT_INSET_BOTTOM,
  GROUP_CONTENT_INSET_X,
  getGroupTopInset,
  GROUP_SAFE_MARGIN,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import {
  buildGroupPortsFromBoundaryEdges,
  buildGroupHandleId,
  getGroupPorts,
  normalizeGroupPortNodes,
  pruneGroupPortEdges,
  updateGroupPortList,
  type GroupPortSide,
} from '@/features/workflow/lib/groupPorts';
import { projectWorkflowToExecutionGraph } from '@/features/workflow/lib/executionGraph';
import { gid, snapValue } from '@/features/workflow/lib/store/helpers';
import type { WorkflowState } from '@/features/workflow/lib/store/types';

export const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);

function snapDownToGrid(value: number) {
  return Math.floor(value / GRID_SIZE) * GRID_SIZE;
}

function snapUpToGrid(value: number) {
  return Math.ceil(value / GRID_SIZE) * GRID_SIZE;
}

export type WorkflowStoreEditorActions = Pick<
  WorkflowState,
  | 'setWorkflowName'
  | 'addNode'
  | 'duplicateNode'
  | 'autoArrangeWorkflow'
  | 'updateNodeData'
  | 'setNodeSize'
  | 'resetNodeSize'
  | 'removeNode'
  | 'removeNodes'
  | 'removeNodeWithoutReconnect'
  | 'removeNodesWithoutReconnect'
  | 'detachNodeFromChain'
  | 'insertNodeOnEdge'
  | 'addEdge'
  | 'removeEdge'
  | 'selectNode'
  | 'duplicateNodes'
  | 'createNodeGroup'
  | 'toggleGroupCollapsed'
  | 'updateGroupPort'
  | 'ungroupNodes'
  | 'releaseNodesFromGroup'
  | 'toggleNodesLocked'
  | 'toggleNodesDisabled'
  | 'onNodesChange'
  | 'onEdgesChange'
  | 'setNodeExecStatus'
  | 'clearAllExecStatus'
  | 'setExecuting'
  | 'setExecutionResult'
  | 'addExecutionLog'
  | 'clearExecutionLogs'
  | 'applyEditorSnapshot'
  | 'newWorkflow'
  | 'markWorkflowDirty'
  | 'setShowDebugSizes'
  | 'setSnapToGridEnabled'
  | 'fetchModels'
  | 'setAvailableModels'
  | 'setProjectModels'
  | 'persistLocalDraft'
>;

function getMergeInputCount(node: Node, edges: Edge[]) {
  const nodeDef = NODE_REGISTRY.find((item) => item.type === node.type);
  if (!nodeDef?.maxInputs) return null;

  let maxConnectedIdx = 0;
  for (const edge of edges) {
    if (edge.target !== node.id || !edge.targetHandle) continue;

    const idx = Number.parseInt(edge.targetHandle.replace('item', ''), 10);
    if (Number.isFinite(idx) && idx > maxConnectedIdx) {
      maxConnectedIdx = idx;
    }
  }

  return Math.min(nodeDef.maxInputs, Math.max(1, maxConnectedIdx + 1));
}

function getDynamicInputIndex(handleId: string | null | undefined) {
  const match = String(handleId || '').match(/^item(\d+)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function compactDynamicInputEdges(nodes: Node[], edges: Edge[]) {
  const dynamicNodeIds = new Set(
    nodes
      .filter((node) => {
        const nodeDef = NODE_REGISTRY.find((item) => item.type === node.type);
        return Boolean(nodeDef?.maxInputs);
      })
      .map((node) => node.id),
  );
  if (dynamicNodeIds.size === 0) return edges;

  const incomingByTarget = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!dynamicNodeIds.has(edge.target) || getDynamicInputIndex(edge.targetHandle) === null) continue;
    incomingByTarget.set(edge.target, [...(incomingByTarget.get(edge.target) || []), edge]);
  }
  if (incomingByTarget.size === 0) return edges;

  const nextHandleByEdgeId = new Map<string, string>();
  for (const incomingEdges of incomingByTarget.values()) {
    incomingEdges
      .sort((edgeA, edgeB) => (
        (getDynamicInputIndex(edgeA.targetHandle) ?? Number.MAX_SAFE_INTEGER)
        - (getDynamicInputIndex(edgeB.targetHandle) ?? Number.MAX_SAFE_INTEGER)
      ))
      .forEach((edge, index) => {
        nextHandleByEdgeId.set(edge.id, `item${index + 1}`);
      });
  }

  let didChange = false;
  const compactedEdges = edges.map((edge) => {
    const nextHandle = nextHandleByEdgeId.get(edge.id);
    if (!nextHandle || edge.targetHandle === nextHandle) return edge;
    didChange = true;
    return {
      ...edge,
      targetHandle: nextHandle,
    };
  });

  return didChange ? compactedEdges : edges;
}

export function normalizeMergeNodeSizes(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    if (node.type === 'textSplit') {
      const minSize = getNodeAutoExpandedSize(
        node.type || '',
        1,
        getNodeOutputCount(node.type || '', node.data as Record<string, unknown> | undefined),
      );
      const nextWidth = typeof node.width === 'number' ? Math.max(minSize.w, node.width) : minSize.w;
      const nextHeight = typeof node.height === 'number' ? Math.max(minSize.h, node.height) : minSize.h;

      if (nextWidth === node.width && nextHeight === node.height) {
        return node;
      }

      return {
        ...node,
        width: nextWidth,
        height: nextHeight,
      };
    }

    const nextInputCount = getMergeInputCount(node, edges);
    if (nextInputCount === null) return node;

    const resolvedInputCount = nextInputCount ?? 1;
    const minSize = getNodeAutoExpandedSize(node.type || '', resolvedInputCount, 1);
    const currentInputCount = (node.data.inputCount as number) || 1;
    const nextWidth = typeof node.width === 'number' ? Math.max(node.width, minSize.w) : minSize.w;
    const nextHeight = typeof node.height === 'number' ? Math.max(node.height, minSize.h) : minSize.h;

    if (currentInputCount === resolvedInputCount && nextWidth === node.width && nextHeight === node.height) {
      return node;
    }

    return {
      ...node,
      width: nextWidth,
      height: nextHeight,
      data: {
        ...node.data,
        inputCount: resolvedInputCount,
      },
    };
  });
}

export function normalizeEditorNodes(nodes: Node[], edges: Edge[]) {
  return normalizeGroupPortNodes(normalizeMergeNodeSizes(nodes, edges), edges);
}

export function getAbsolutePosition(
  nodeId: string,
  nodeMap: Map<string, Node>,
  memo = new Map<string, { x: number; y: number }>(),
) {
  const cached = memo.get(nodeId);
  if (cached) return cached;

  const node = nodeMap.get(nodeId);
  if (!node) {
    const fallback = { x: 0, y: 0 };
    memo.set(nodeId, fallback);
    return fallback;
  }

  let position = { x: node.position.x, y: node.position.y };
  const parentId = (node as Node & { parentId?: string }).parentId;
  if (parentId && nodeMap.has(parentId)) {
    const parentPosition = getAbsolutePosition(parentId, nodeMap, memo);
    position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
  }

  memo.set(nodeId, position);
  return position;
}

function getDescendantNodeIds(nodes: Node[], rootIds: string[]) {
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parentId = (node as Node & { parentId?: string }).parentId;
    if (!parentId) continue;
    const current = byParent.get(parentId) || [];
    current.push(node.id);
    byParent.set(parentId, current);
  }

  const visited = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    for (const childId of byParent.get(currentId) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return [...visited];
}

export function expandNodeActionIds(nodes: Node[], nodeIds: string[]) {
  const uniqueIds = [...new Set(nodeIds)].filter((id) => nodes.some((node) => node.id === id));
  if (uniqueIds.length === 0) return [];
  return [...new Set([...uniqueIds, ...getDescendantNodeIds(nodes, uniqueIds)])];
}

export function isNodeLocked(node: Node | undefined) {
  return Boolean(node?.data?.locked);
}

export function isNodeLockedWithAncestors(nodeId: string, nodes: Node[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let current = nodeMap.get(nodeId);

  while (current) {
    if (isNodeLocked(current)) return true;
    const parentId = (current as Node & { parentId?: string }).parentId;
    current = parentId ? nodeMap.get(parentId) : undefined;
  }

  return false;
}

export function duplicateNodesWithGroups(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const expandedIds = expandNodeActionIds(nodes, nodeIds);
  if (expandedIds.length === 0) return { nodes: [], edges: [] };

  const selectedSet = new Set(expandedIds);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();
  const idMap = new Map<string, string>();

  for (const nodeId of expandedIds) {
    idMap.set(nodeId, `node_${gid()}`);
  }

  const remapGroupData = (data: Record<string, unknown> | undefined) => {
    if (!data) return data;

    let nextData = { ...data };
    for (const side of ['input', 'output'] as GroupPortSide[]) {
      nextData = {
        ...nextData,
        ...updateGroupPortList(nextData, side, (ports) => ports.map((port) => (
          {
            ...port,
            insideLinks: port.insideLinks.map((link) => ({
              ...link,
              nodeId: idMap.get(link.nodeId) || link.nodeId,
            })),
            outsideLinks: port.outsideLinks.map((link) => ({
              ...link,
              nodeId: idMap.get(link.nodeId) || link.nodeId,
            })),
          }
        ))),
      };
    }

    return nextData;
  };

  const duplicatedNodes = nodes
    .filter((node) => selectedSet.has(node.id))
    .map((node) => {
      const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
      const parentId = (node as Node & { parentId?: string }).parentId;
      const nextParentId = parentId && idMap.has(parentId) ? idMap.get(parentId) : undefined;

      return {
        ...node,
        id: idMap.get(node.id) || `node_${gid()}`,
        position: nextParentId
          ? { ...node.position }
          : {
              x: absolutePosition.x + 48,
              y: absolutePosition.y + 48,
            },
        parentId: nextParentId,
        extent: nextParentId ? 'parent' : undefined,
        data: node.type === 'group'
          ? (remapGroupData(node.data as Record<string, unknown> | undefined) || {})
          : ((node.data as Record<string, unknown> | undefined) || {}),
        selected: true,
      } satisfies Node;
    });

  const duplicatedEdges = edges
    .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `edge_${gid()}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

  return { nodes: normalizeEditorNodes(duplicatedNodes, duplicatedEdges), edges: duplicatedEdges };
}

export function buildGroupForNodes(nodes: Node[], edges: Edge[], nodeIds: string[]) {
  const targetIds = [...new Set(nodeIds)];
  const selectedNodes = nodes.filter((node) => targetIds.includes(node.id) && node.type !== 'group');
  if (selectedNodes.length < 2) return null;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();
  const contentPaddingX = GROUP_CONTENT_INSET_X;
  const contentPaddingTop = getGroupTopInset();
  const contentPaddingBottom = GROUP_CONTENT_INSET_BOTTOM;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of selectedNodes) {
    const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
    const size = getEffectiveNodeSize(node);
    minX = Math.min(minX, absolutePosition.x);
    minY = Math.min(minY, absolutePosition.y);
    maxX = Math.max(maxX, absolutePosition.x + size.width);
    maxY = Math.max(maxY, absolutePosition.y + size.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const minSize = getNodeDefaultSize('group');
  const groupId = `node_${gid()}`;
  const groupPosition = {
    x: snapDownToGrid(minX - contentPaddingX),
    y: snapDownToGrid(minY - contentPaddingTop),
  };
  const groupWidth = Math.max(minSize.w, snapUpToGrid(maxX - minX + contentPaddingX * 2));
  const groupHeight = Math.max(minSize.h, snapUpToGrid(maxY - minY + contentPaddingTop + contentPaddingBottom));

  const selectedSet = new Set(selectedNodes.map((node) => node.id));
  const portData = buildGroupPortsFromBoundaryEdges(nodes, edges, [...selectedSet]);
  const groupNode: Node = {
    id: groupId,
    type: 'group',
    position: groupPosition,
    width: groupWidth,
    height: groupHeight,
    data: {
      title: `Group ${selectedNodes.length}`,
      collapsed: false,
      ...portData,
    },
    selected: true,
  };

  const appendEdge = (collection: Edge[], nextEdge: Edge) => {
    const exists = collection.some((edge) => (
      edge.source === nextEdge.source
      && edge.sourceHandle === nextEdge.sourceHandle
      && edge.target === nextEdge.target
      && edge.targetHandle === nextEdge.targetHandle
    ));
    if (!exists) {
      collection.push(nextEdge);
    }
  };

  const rewrittenEdgesBase = edges.filter((edge) => {
    const sourceInside = selectedSet.has(edge.source);
    const targetInside = selectedSet.has(edge.target);
    return sourceInside === targetInside;
  });

  const generatedGroupEdges: Edge[] = [];
  const groupData = (groupNode.data || {}) as Record<string, unknown>;

  for (const port of getGroupPorts(groupData, 'input')) {
    const outsideLink = port.outsideLinks[0];
    if (outsideLink) {
      appendEdge(generatedGroupEdges, {
        id: `edge_${gid()}`,
        source: outsideLink.nodeId,
        sourceHandle: outsideLink.handleId,
        target: groupId,
        targetHandle: buildGroupHandleId('input', port.id, 'external'),
        type: 'default',
        animated: false,
        style: { strokeWidth: 2 },
      });
    }

    for (const insideLink of port.insideLinks) {
      appendEdge(generatedGroupEdges, {
        id: `edge_${gid()}`,
        source: groupId,
        sourceHandle: buildGroupHandleId('input', port.id, 'internal'),
        target: insideLink.nodeId,
        targetHandle: insideLink.handleId,
        type: 'default',
        animated: false,
        style: { strokeWidth: 2 },
      });
    }
  }

  for (const port of getGroupPorts(groupData, 'output')) {
    const insideLink = port.insideLinks[0];
    if (insideLink) {
      appendEdge(generatedGroupEdges, {
        id: `edge_${gid()}`,
        source: insideLink.nodeId,
        sourceHandle: insideLink.handleId,
        target: groupId,
        targetHandle: buildGroupHandleId('output', port.id, 'internal'),
        type: 'default',
        animated: false,
        style: { strokeWidth: 2 },
      });
    }

    for (const outsideLink of port.outsideLinks) {
      appendEdge(generatedGroupEdges, {
        id: `edge_${gid()}`,
        source: groupId,
        sourceHandle: buildGroupHandleId('output', port.id, 'external'),
        target: outsideLink.nodeId,
        targetHandle: outsideLink.handleId,
        type: 'default',
        animated: false,
        style: { strokeWidth: 2 },
      });
    }
  }

  const rewrittenEdges = pruneGroupPortEdges(
    [groupNode, ...nodes],
    [...rewrittenEdgesBase, ...generatedGroupEdges],
  );

  const updatedNodes = nodes.map((node) => {
    if (!selectedSet.has(node.id)) {
      return pushRootNodeOutsideGroupAreas(node, [groupNode, ...nodes]);
    }

    const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
    const bounds = getGroupContentBounds(groupNode, node);
    const relativePosition = {
      x: Math.min(Math.max(absolutePosition.x - groupPosition.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(absolutePosition.y - groupPosition.y, bounds.minY), bounds.maxY),
    };

    return constrainChildNodeToGroupContent({
      ...node,
      position: relativePosition,
      parentId: groupId,
      selected: false,
    } as Node, groupNode);
  });

  return {
    groupNode,
    nodes: normalizeEditorNodes(enforceGroupLayout([groupNode, ...updatedNodes]), rewrittenEdges),
    edges: rewrittenEdges,
  };
}

export function ungroupGroupNodes(nodes: Node[], groupIds: string[]) {
  const targetGroups = new Set(
    groupIds.filter((id) => nodes.some((node) => node.id === id && node.type === 'group')),
  );
  if (targetGroups.size === 0) return nodes;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();

  return nodes.flatMap((node) => {
    if (targetGroups.has(node.id)) return [];

    const parentId = (node as Node & { parentId?: string }).parentId;
    if (parentId && targetGroups.has(parentId)) {
      const absolutePosition = getAbsolutePosition(node.id, nodeMap, positionMemo);
      return [{
        ...node,
        parentId: undefined,
        extent: undefined,
        position: absolutePosition,
        selected: true,
      } satisfies Node];
    }

    return [node];
  });
}

function getNodeParentId(node: Node) {
  return (node as Node & { parentId?: string }).parentId;
}

function buildChildLayerMap(nodes: Node[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const layerMap = new Map<string, number>();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))
    .map((node) => node.id);

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    const nextLayer = layerMap.get(nodeId) || 0;
    for (const targetId of outgoing.get(nodeId) || []) {
      layerMap.set(targetId, Math.max(layerMap.get(targetId) || 0, nextLayer + 1));
      indegree.set(targetId, (indegree.get(targetId) || 0) - 1);
      if ((indegree.get(targetId) || 0) <= 0) {
        queue.push(targetId);
      }
    }
  }

  for (const node of nodes) {
    if (layerMap.has(node.id)) continue;
    const incomingLayers = edges
      .filter((edge) => edge.target === node.id && nodeIds.has(edge.source))
      .map((edge) => layerMap.get(edge.source) || 0);
    layerMap.set(node.id, incomingLayers.length > 0 ? Math.max(...incomingLayers) + 1 : 0);
  }

  return layerMap;
}

function buildNodeOrderMap(nodes: Node[]) {
  const orderMap = new Map<string, number>();
  nodes.forEach((node, index) => {
    orderMap.set(node.id, index);
  });
  return orderMap;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getNodesBounds(nodes: Node[]) {
  return nodes.reduce((acc, node) => {
    const size = getEffectiveNodeSize(node);
    return {
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + size.width),
      maxY: Math.max(acc.maxY, node.position.y + size.height),
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

function getBoundsCenter(bounds: ReturnType<typeof getNodesBounds>) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function buildConnectedNodeBlocks(nodes: Node[], edges: Edge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target) || edge.source === edge.target) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const blocks: Node[][] = [];

  const sortedNodes = [...nodes].sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
  for (const node of sortedNodes) {
    if (visited.has(node.id)) continue;

    const queue = [node.id];
    const blockIds: string[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      blockIds.push(currentId);

      for (const nextId of adjacency.get(currentId) || []) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }

    const block = blockIds
      .map((id) => nodeMap.get(id))
      .filter((item): item is Node => Boolean(item))
      .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));

    if (block.length > 0) {
      blocks.push(block);
    }
  }

  return blocks;
}

function getScopeChildNodeId(
  nodeId: string,
  nodeMap: Map<string, Node>,
  parentId?: string,
): string | null {
  let current = nodeMap.get(nodeId);
  while (current) {
    const currentParentId = getNodeParentId(current);
    if (currentParentId === parentId) {
      return current.id;
    }
    if (!currentParentId) {
      return parentId === undefined ? current.id : null;
    }
    current = nodeMap.get(currentParentId);
  }
  return null;
}

function buildScopedArrangementEdges(
  allNodes: Node[],
  scopeNodes: Node[],
  edges: Edge[],
  parentId?: string,
) {
  const scopeNodeSet = new Set(scopeNodes.map((node) => node.id));
  const nodeMap = new Map(allNodes.map((node) => [node.id, node]));
  const projected = projectWorkflowToExecutionGraph(allNodes, edges);
  const seen = new Set<string>();
  const scopedEdges: Edge[] = [];

  for (const edge of projected.edges) {
    const sourceScopeId = getScopeChildNodeId(edge.source, nodeMap, parentId);
    const targetScopeId = getScopeChildNodeId(edge.target, nodeMap, parentId);
    if (!sourceScopeId || !targetScopeId || sourceScopeId === targetScopeId) continue;
    if (!scopeNodeSet.has(sourceScopeId) || !scopeNodeSet.has(targetScopeId)) continue;

    const key = `${sourceScopeId}->${targetScopeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopedEdges.push({
      ...edge,
      id: `layout_${key}`,
      source: sourceScopeId,
      sourceHandle: null,
      target: targetScopeId,
      targetHandle: null,
    });
  }

  return scopedEdges;
}

function sortLayerNodesByFlow(
  layerNodes: Node[],
  allLayerNodes: Map<number, Node[]>,
  edges: Edge[],
  layerMap: Map<string, number>,
) {
  const incomingOrder = new Map<string, number[]>();
  const outgoingOrder = new Map<string, number[]>();

  const previousLayerNodes = new Map<number, Map<string, number>>();
  const nextLayerNodes = new Map<number, Map<string, number>>();

  for (const [layer, nodes] of allLayerNodes.entries()) {
    const orderMap = buildNodeOrderMap(nodes);
    previousLayerNodes.set(layer, orderMap);
    nextLayerNodes.set(layer, orderMap);
  }

  for (const edge of edges) {
    const sourceLayer = layerMap.get(edge.source);
    const targetLayer = layerMap.get(edge.target);
    if (sourceLayer === undefined || targetLayer === undefined || sourceLayer === targetLayer) continue;

    const sourceOrder = previousLayerNodes.get(sourceLayer)?.get(edge.source);
    const targetOrder = nextLayerNodes.get(targetLayer)?.get(edge.target);
    if (sourceOrder !== undefined) {
      const current = incomingOrder.get(edge.target) || [];
      current.push(sourceOrder);
      incomingOrder.set(edge.target, current);
    }
    if (targetOrder !== undefined) {
      const current = outgoingOrder.get(edge.source) || [];
      current.push(targetOrder);
      outgoingOrder.set(edge.source, current);
    }
  }

  return [...layerNodes].sort((a, b) => {
    const aIncoming = average(incomingOrder.get(a.id) || []);
    const bIncoming = average(incomingOrder.get(b.id) || []);
    if (aIncoming !== null && bIncoming !== null && aIncoming !== bIncoming) {
      return aIncoming - bIncoming;
    }

    const aOutgoing = average(outgoingOrder.get(a.id) || []);
    const bOutgoing = average(outgoingOrder.get(b.id) || []);
    if (aOutgoing !== null && bOutgoing !== null && aOutgoing !== bOutgoing) {
      return aOutgoing - bOutgoing;
    }

    return (a.position.y - b.position.y) || (a.position.x - b.position.x);
  });
}

export function autoArrangeNodes(nodes: Node[], edges: Edge[], selectedNodeIds?: string[]) {
  const nextNodes = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: node.data ? { ...node.data } : node.data,
  }));
  const nodeMap = new Map(nextNodes.map((node) => [node.id, node]));
  const rootStart = GRID_SIZE * 2;
  const columnGap = GRID_SIZE * 4;
  const rowGap = GRID_SIZE * 2;
  const blockGap = GRID_SIZE * 4;
  const expandedSelectedIds = selectedNodeIds?.length ? new Set(expandNodeActionIds(nextNodes, selectedNodeIds)) : null;

  const arrangeScope = (parentId?: string) => {
    const directChildren = nextNodes.filter((node) => getNodeParentId(node) === parentId);
    if (directChildren.length === 0) return;

    for (const child of directChildren) {
      if (child.type === 'group') {
        arrangeScope(child.id);
      }
    }

    const targetChildren = expandedSelectedIds
      ? directChildren.filter((node) => expandedSelectedIds.has(node.id))
      : directChildren;
    if (targetChildren.length === 0) return;
    const movableTargetChildren = targetChildren.filter((node) => !isNodeLockedWithAncestors(node.id, nextNodes));

    const scopedEdges = buildScopedArrangementEdges(nextNodes, targetChildren, edges, parentId);

    const selectedBounds = getNodesBounds(targetChildren);
    const originalMovableBounds = movableTargetChildren.length > 0 ? getNodesBounds(movableTargetChildren) : null;

    const baseX = Number.isFinite(selectedBounds.minX)
      ? selectedBounds.minX
      : parentId ? GROUP_SAFE_MARGIN : rootStart;
    const baseY = Number.isFinite(selectedBounds.minY)
      ? selectedBounds.minY
      : parentId ? getGroupTopInset() : rootStart;

    const startX = snapValue(parentId ? Math.max(GROUP_SAFE_MARGIN, baseX) : Math.max(rootStart, baseX));
    let nextBlockY = snapValue(parentId ? Math.max(getGroupTopInset(), baseY) : Math.max(rootStart, baseY));
    const connectedBlocks = buildConnectedNodeBlocks(targetChildren, scopedEdges);

    for (const blockNodes of connectedBlocks) {
      const blockNodeIds = new Set(blockNodes.map((node) => node.id));
      const blockEdges = scopedEdges.filter((edge) => blockNodeIds.has(edge.source) && blockNodeIds.has(edge.target));
      const layerMap = buildChildLayerMap(blockNodes, blockEdges);

      const groupedByLayer = new Map<number, Node[]>();
      for (const child of blockNodes) {
        const layer = layerMap.get(child.id) || 0;
        const current = groupedByLayer.get(layer) || [];
        current.push(child);
        groupedByLayer.set(layer, current);
      }

      const layers = [...groupedByLayer.keys()].sort((a, b) => a - b);
      const orderedByLayer = new Map<number, Node[]>();
      for (const layer of layers) {
        orderedByLayer.set(
          layer,
          sortLayerNodesByFlow(
            groupedByLayer.get(layer) || [],
            groupedByLayer,
            blockEdges,
            layerMap,
          ),
        );
      }

      let nextX = startX;
      for (const layer of layers) {
        const layerNodes = orderedByLayer.get(layer) || [];
        let nextY = nextBlockY;
        let maxLayerWidth = 0;

        for (const node of layerNodes) {
          const movable = !isNodeLockedWithAncestors(node.id, nextNodes);
          const size = getEffectiveNodeSize(nodeMap.get(node.id) || node);
          if (movable) {
            node.position = {
              x: snapValue(nextX),
              y: snapValue(nextY),
            };
          }
          maxLayerWidth = Math.max(maxLayerWidth, size.width);
          nextY = snapValue(nextY + size.height + rowGap);
        }

        nextX = snapValue(nextX + maxLayerWidth + columnGap);
      }

      const arrangedBlockBounds = getNodesBounds(blockNodes);
      nextBlockY = snapValue(arrangedBlockBounds.maxY + blockGap);
    }

    if (!parentId && originalMovableBounds && movableTargetChildren.length > 0) {
      const arrangedMovableBounds = getNodesBounds(movableTargetChildren);
      const originalCenter = getBoundsCenter(originalMovableBounds);
      const arrangedCenter = getBoundsCenter(arrangedMovableBounds);
      const deltaX = snapValue(originalCenter.x - arrangedCenter.x);
      const deltaY = snapValue(originalCenter.y - arrangedCenter.y);

      if (deltaX !== 0 || deltaY !== 0) {
        for (const node of movableTargetChildren) {
          node.position = {
            x: normalizeZero(snapValue(node.position.x + deltaX)),
            y: normalizeZero(snapValue(node.position.y + deltaY)),
          };
        }
      }
    }

    if (!parentId) return;

    const groupNode = nodeMap.get(parentId);
    if (!groupNode || groupNode.type !== 'group') return;

    const minSize = getNodeDefaultSize('group');
    let maxX = GROUP_CONTENT_INSET_X;
    let maxY = getGroupTopInset();

    for (const child of directChildren) {
      const size = getEffectiveNodeSize(child);
      maxX = Math.max(maxX, child.position.x + size.width);
      maxY = Math.max(maxY, child.position.y + size.height);
    }

    if (!isNodeLocked(groupNode)) {
      groupNode.width = Math.max(minSize.w, snapUpToGrid(maxX + GROUP_CONTENT_INSET_X));
      groupNode.height = Math.max(minSize.h, snapUpToGrid(maxY + GROUP_CONTENT_INSET_BOTTOM));
    }
  };

  arrangeScope(undefined);
  return enforceGroupLayout(nextNodes).map((node) => ({
    ...node,
    position: {
      x: normalizeZero(node.position.x),
      y: normalizeZero(node.position.y),
    },
  }));
}

export const EMPTY_WORKFLOW_SNAPSHOT = {
  workflowName: DEFAULT_WORKFLOW_NAME,
  nodes: [],
  edges: [],
};
