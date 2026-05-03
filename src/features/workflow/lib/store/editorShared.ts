import type { Edge, Node } from '@xyflow/react';
import { DEFAULT_WORKFLOW_NAME, getNodeDefaultSize, NODE_REGISTRY } from '@/features/workflow/lib/constants';
import {
  constrainChildNodeToGroupContent,
  enforceGroupLayout,
  getEffectiveNodeSize,
  getGroupContentBounds,
  getGroupTopInset,
  GROUP_SAFE_MARGIN,
  pushRootNodeOutsideGroupAreas,
} from '@/features/workflow/lib/groupLayout';
import { gid, snapValue } from '@/features/workflow/lib/store/helpers';
import type { WorkflowState } from '@/features/workflow/lib/store/types';

export const FORCE_DISABLED_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge']);

export type WorkflowStoreEditorActions = Pick<
  WorkflowState,
  | 'setWorkflowName'
  | 'addNode'
  | 'duplicateNode'
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
  | 'ungroupNodes'
  | 'releaseNodesFromGroup'
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

  return { nodes: duplicatedNodes, edges: duplicatedEdges };
}

export function buildGroupForNodes(nodes: Node[], nodeIds: string[]) {
  const targetIds = [...new Set(nodeIds)];
  const selectedNodes = nodes.filter((node) => targetIds.includes(node.id) && node.type !== 'group');
  if (selectedNodes.length < 2) return null;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positionMemo = new Map<string, { x: number; y: number }>();
  const contentPaddingX = GROUP_SAFE_MARGIN;
  const contentPaddingTop = getGroupTopInset();
  const contentPaddingBottom = GROUP_SAFE_MARGIN;

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
    x: snapValue(minX - contentPaddingX),
    y: snapValue(minY - contentPaddingTop),
  };
  const groupWidth = Math.max(minSize.w, snapValue(maxX - minX + contentPaddingX * 2));
  const groupHeight = Math.max(minSize.h, snapValue(maxY - minY + contentPaddingTop + contentPaddingBottom));

  const selectedSet = new Set(selectedNodes.map((node) => node.id));
  const groupNode: Node = {
    id: groupId,
    type: 'group',
    position: groupPosition,
    width: groupWidth,
    height: groupHeight,
    data: { title: `节点组${selectedNodes.length}` },
    selected: true,
  };

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
    nodes: enforceGroupLayout([groupNode, ...updatedNodes]),
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

export const EMPTY_WORKFLOW_SNAPSHOT = {
  workflowName: DEFAULT_WORKFLOW_NAME,
  nodes: [],
  edges: [],
};
