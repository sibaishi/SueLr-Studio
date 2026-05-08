import type { Node } from '@xyflow/react';
import { pruneGroupPortEdges } from '@/features/workflow/lib/groupPorts';
import { buildBypassEdgesForNode } from '@/features/workflow/lib/store/editorGraphEdgeBuilders';
import { removeGroupPortLinksReferencingNodes } from '@/features/workflow/lib/store/editorGraphGroupEdges';
import { clearRemovedNodeRuntimeState } from '@/features/workflow/lib/store/editorGraphRuntimeState';
import { compactDynamicInputEdges, normalizeEditorNodes } from '@/features/workflow/lib/store/editorShared';
import type { WorkflowState } from '@/features/workflow/lib/store/types';

type GraphRemovalState = Pick<
  WorkflowState,
  | 'nodes'
  | 'edges'
  | 'selectedNodeId'
  | 'nodeExecStatus'
  | 'nodeExecutionTime'
  | 'nodeExecutionStartedAt'
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
  const bypassEdges = reconnectEdges && removedSet.size === 1
    ? buildBypassEdgesForNode(state.nodes, state.edges, [...removedSet][0], edges)
    : [];
  const updatedNodes = removeGroupPortLinksReferencingNodes(remainingNodes, removedSet);
  const nextEdges = pruneGroupPortEdges(updatedNodes, compactDynamicInputEdges(updatedNodes, [...edges, ...bypassEdges]));

  return {
    nodes: normalizeEditorNodes(updatedNodes, nextEdges),
    edges: nextEdges,
    selectedNodeId: removedSet.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
    ...runtimeState,
    workflowWarningMessage: null,
    hasUnsavedChanges: true,
  };
}
