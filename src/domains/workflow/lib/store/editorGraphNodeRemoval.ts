import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { buildBypassEdgesForNode } from '@/domains/workflow/lib/store/editorGraphEdgeBuilders';
import { removeGroupPortLinksReferencingNodes } from '@/domains/workflow/lib/store/editorGraphGroupEdges';
import { clearRemovedNodeRuntimeState } from '@/domains/workflow/lib/store/editorGraphRuntimeState';
import { compactDynamicInputEdges, normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import type { WorkflowState } from '@/domains/workflow/lib/store/types';
import type { Node } from '@xyflow/react';

type GraphRemovalState = Pick<
  WorkflowState,
  | 'nodes'
  | 'edges'
  | 'selectedNodeId'
  | 'nodeExecStatus'
  | 'nodeExecutionTime'
  | 'nodeExecutionStartedAt'
  | 'nodeExecutionActiveCounts'
  | 'nodeExecutionStartedCounts'
  | 'nodeExecutionCompletedCounts'
  | 'nodeExecutionExpectedCounts'
  | 'nodeErrors'
  | 'nodeWarnings'
  | 'nodeOutputs'
  | 'aiResultOutputs'
  | 'executionLogs'
>;

export function buildRemovedNodesGraphState(
  state: GraphRemovalState,
  removedSet: Set<string>,
  remainingNodes: Node[],
  reconnectEdges: boolean,
) {
  const runtimeState = clearRemovedNodeRuntimeState(state, removedSet);
  const edges = state.edges.filter((edge) => !removedSet.has(edge.source) && !removedSet.has(edge.target));
  const bypassEdges =
    reconnectEdges && removedSet.size === 1
      ? buildBypassEdgesForNode(state.nodes, state.edges, [...removedSet][0], edges)
      : [];
  const updatedNodes = removeGroupPortLinksReferencingNodes(remainingNodes, removedSet);
  const nextEdges = pruneGroupPortEdges(
    updatedNodes,
    compactDynamicInputEdges(updatedNodes, [...edges, ...bypassEdges]),
  );

  return {
    nodes: normalizeEditorNodes(updatedNodes, nextEdges),
    edges: nextEdges,
    selectedNodeId: removedSet.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
    ...runtimeState,
    workflowWarningMessage: null,
    hasUnsavedChanges: true,
  };
}
