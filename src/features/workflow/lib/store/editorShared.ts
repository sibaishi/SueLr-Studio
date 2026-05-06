import type { Edge, Node } from '@xyflow/react';
import { DEFAULT_WORKFLOW_NAME, getNodeDefaultSize, GRID_SIZE, NODE_REGISTRY } from '@/features/workflow/lib/constants';
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
  findGroupPortByBinding,
  normalizeGroupPortNodes,
  pruneGroupPortEdges,
  updateGroupPortList,
  type GroupPortSide,
} from '@/features/workflow/lib/groupPorts';
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

export function normalizeMergeNodeSizes(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    const nextInputCount = getMergeInputCount(node, edges);
    if (nextInputCount === null) return node;

    const minSize = getNodeDefaultSize(node.type || '', nextInputCount);
    const currentInputCount = (node.data.inputCount as number) || 1;
    const nextWidth = typeof node.width === 'number' ? Math.max(node.width, minSize.w) : node.width;
    const nextHeight = typeof node.height === 'number' ? Math.max(node.height, minSize.h) : node.height;

    if (
      currentInputCount === nextInputCount &&
      nextWidth === node.width &&
      nextHeight === node.height
    ) {
      return node;
    }

    return {
      ...node,
      width: nextWidth,
      height: nextHeight,
      data: {
        ...node.data,
        inputCount: nextInputCount,
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
          port.binding && idMap.has(port.binding.nodeId)
            ? {
                ...port,
                binding: {
                  ...port.binding,
                  nodeId: idMap.get(port.binding.nodeId) || port.binding.nodeId,
                },
              }
            : port
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

  const rewrittenEdges = pruneGroupPortEdges(
    [groupNode, ...nodes],
    edges.map((edge) => {
      const sourceInside = selectedSet.has(edge.source);
      const targetInside = selectedSet.has(edge.target);

      if (!sourceInside && targetInside && edge.targetHandle) {
        const port = findGroupPortByBinding(
          groupNode.data as Record<string, unknown>,
          'input',
          { nodeId: edge.target, handleId: edge.targetHandle },
        );
        if (port?.binding) {
          return {
            ...edge,
            target: groupId,
            targetHandle: buildGroupHandleId('input', port.id, 'external'),
          };
        }
      }

      if (sourceInside && !targetInside && edge.sourceHandle) {
        const port = findGroupPortByBinding(
          groupNode.data as Record<string, unknown>,
          'output',
          { nodeId: edge.source, handleId: edge.sourceHandle },
        );
        if (port?.binding) {
          return {
            ...edge,
            source: groupId,
            sourceHandle: buildGroupHandleId('output', port.id, 'external'),
          };
        }
      }

      return edge;
    }),
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

    const scopedEdges = edges.filter((edge) => (
      targetChildren.some((node) => node.id === edge.source)
      && targetChildren.some((node) => node.id === edge.target)
    ));

    const layerMap = buildChildLayerMap(targetChildren, scopedEdges);

    const groupedByLayer = new Map<number, Node[]>();
    for (const child of targetChildren) {
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
          scopedEdges,
          layerMap,
        ),
      );
    }

    const selectedBounds = targetChildren.reduce((acc, node) => {
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

    const baseX = Number.isFinite(selectedBounds.minX)
      ? selectedBounds.minX
      : parentId ? GROUP_SAFE_MARGIN : rootStart;
    const baseY = Number.isFinite(selectedBounds.minY)
      ? selectedBounds.minY
      : parentId ? getGroupTopInset() : rootStart;
    let nextX = snapValue(parentId ? Math.max(GROUP_SAFE_MARGIN, baseX) : Math.max(rootStart, baseX));
    const startY = snapValue(parentId ? Math.max(getGroupTopInset(), baseY) : Math.max(rootStart, baseY));

    for (const layer of layers) {
      const layerNodes = orderedByLayer.get(layer) || [];
      let nextY = startY;
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
  return enforceGroupLayout(nextNodes);
}

export const EMPTY_WORKFLOW_SNAPSHOT = {
  workflowName: DEFAULT_WORKFLOW_NAME,
  nodes: [],
  edges: [],
};
