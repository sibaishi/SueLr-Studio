import { getExpandedNodeOutputs, getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { createsCycle } from '@/domains/workflow/lib/store/editorGraph';
import type { Connection, Node as FlowNodeType } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import { canNodeTypesConnect, getInputType, getOutputType } from '../flowCanvasConnections';
import type { ContextMenuKind, ContextMenuState, PendingConnection } from '../flowCanvasTypes';
import type { FlowHookDeps } from './types';

interface UseFlowConnectionDeps extends FlowHookDeps {
  openContextMenuAtPoint: (
    kind: ContextMenuKind,
    event: MouseEvent | TouchEvent,
    extras?: Partial<ContextMenuState>,
  ) => void;
  renderNodeMap: Map<string, FlowNodeType>;
}

export function useFlowConnection({ openContextMenuAtPoint, renderNodeMap, store }: UseFlowConnectionDeps) {
  const pendingConnectionRef = useRef<PendingConnection | null>(null);

  const commitConnection = useCallback((connection: Connection) => {
    if (!connection.sourceHandle || !connection.targetHandle) return;
    useWorkflowStore.getState().addEdge(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      commitConnection(connection);
    },
    [commitConnection],
  );

  const isValidConnection = useCallback(
    (connection: {
      source: string | null;
      target: string | null;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      // Prevent cycles — if target can already reach source, this edge would close a loop
      if (createsCycle(store.nodes as { id: string }[], store.edges, connection.source, connection.target))
        return false;

      const sourceNode = renderNodeMap.get(connection.source);
      const targetNode = renderNodeMap.get(connection.target);
      if (!sourceNode || !targetNode) return false;
      const sourceType = getOutputType(sourceNode, connection.sourceHandle);
      const targetType = getInputType(targetNode, connection.targetHandle);
      return canNodeTypesConnect(sourceType, targetType);
    },
    [renderNodeMap, store.nodes, store.edges],
  );

  const onConnectStart = useCallback(
    (
      _: unknown,
      params: {
        nodeId?: string | null;
        handleId?: string | null;
        handleType?: 'source' | 'target' | null;
      },
    ) => {
      if (!params.handleType || !params.nodeId || !params.handleId) {
        pendingConnectionRef.current = null;
        return;
      }

      const node = store.nodes.find((item) => item.id === params.nodeId);
      if (!node) {
        pendingConnectionRef.current = null;
        return;
      }

      const def = getNodeDef(node.type || '');
      if (!def) {
        pendingConnectionRef.current = null;
        return;
      }

      if (params.handleType === 'source') {
        const currentNode = store.nodes.find((item) => item.id === params.nodeId);
        const outputs = def.maxOutputs
          ? getExpandedNodeOutputs(currentNode?.type || '', (currentNode?.data || {}) as Record<string, unknown>)
          : def.outputs;
        const port = outputs.find((output) => output.id === params.handleId);
        if (!port) {
          pendingConnectionRef.current = null;
          return;
        }

        pendingConnectionRef.current = {
          allowCreateNode: true,
          handleType: 'source',
          sourceId: params.nodeId,
          sourceHandle: params.handleId,
          sourceType: port.type,
        };
        return;
      }

      const port = def.maxInputs ? def.inputs[0] : def.inputs.find((input) => input.id === params.handleId);
      if (!port) {
        pendingConnectionRef.current = null;
        return;
      }

      pendingConnectionRef.current = {
        allowCreateNode: true,
        handleType: 'target',
        targetId: params.nodeId,
        targetHandle: params.handleId,
        targetType: port.type,
      };
    },
    [store.nodes],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: { isValid: boolean | null }) => {
      const pending = pendingConnectionRef.current;
      pendingConnectionRef.current = null;

      if (!pending || state.isValid || !pending.allowCreateNode) return;
      openContextMenuAtPoint('connect', event, { sourceConnection: pending });
    },
    [openContextMenuAtPoint],
  );

  return {
    commitConnection,
    isValidConnection,
    onConnect,
    onConnectEnd,
    onConnectStart,
  };
}
