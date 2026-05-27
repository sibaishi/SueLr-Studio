import { PORT_COMPATIBILITY, getExpandedNodeOutputs, getNodeDef } from '@/domains/workflow/lib/constants';
import { findGroupPort, isGroupPortExternallyConnectable, parseGroupHandleId } from '@/domains/workflow/lib/groupPorts';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { Connection, Node as FlowNodeType } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import {
  canConnectToGroupHandleExternally,
  getInputType,
  getOutputType,
  getParentId,
  resolveDirectionalGroupConnection,
} from '../flowCanvasConnections';
import type { ContextMenuKind, ContextMenuState, PendingConnection } from '../flowCanvasTypes';
import { getNearestGroupAncestorId } from '../flowCanvasUiHelpers';
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
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

    const currentStore = useWorkflowStore.getState();
    const nodeMap = new Map(currentStore.nodes.map((node) => [node.id, node as FlowNodeType]));
    const resolvedConnection = resolveDirectionalGroupConnection(connection, nodeMap);
    if (!resolvedConnection) return;

    const sourceNode = nodeMap.get(resolvedConnection.source);
    const targetNode = nodeMap.get(resolvedConnection.target);
    if (!sourceNode || !targetNode) return;

    const sourceGroupHandle = parseGroupHandleId(resolvedConnection.sourceHandle);
    const targetGroupHandle = parseGroupHandleId(resolvedConnection.targetHandle);

    if (!sourceGroupHandle && !targetGroupHandle) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      targetGroupHandle &&
      targetNode.type === 'group' &&
      targetGroupHandle.side === 'output' &&
      targetGroupHandle.role === 'internal'
    ) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      sourceGroupHandle &&
      sourceNode.type === 'group' &&
      sourceGroupHandle.side === 'input' &&
      sourceGroupHandle.role === 'internal'
    ) {
      currentStore.addEdge(
        resolvedConnection.source,
        resolvedConnection.sourceHandle,
        resolvedConnection.target,
        resolvedConnection.targetHandle,
      );
      return;
    }

    if (
      sourceGroupHandle &&
      sourceNode.type === 'group' &&
      sourceGroupHandle.side === 'output' &&
      sourceGroupHandle.role === 'external'
    ) {
      const sourcePort = findGroupPort(
        (sourceNode.data || {}) as Record<string, unknown>,
        'output',
        sourceGroupHandle.portId,
      );
      if (sourcePort && isGroupPortExternallyConnectable(sourcePort)) {
        currentStore.addEdge(
          resolvedConnection.source,
          resolvedConnection.sourceHandle,
          resolvedConnection.target,
          resolvedConnection.targetHandle,
        );
      }
      return;
    }

    if (
      targetGroupHandle &&
      targetNode.type === 'group' &&
      targetGroupHandle.side === 'input' &&
      targetGroupHandle.role === 'external'
    ) {
      const targetPort = findGroupPort(
        (targetNode.data || {}) as Record<string, unknown>,
        'input',
        targetGroupHandle.portId,
      );
      if (targetPort && isGroupPortExternallyConnectable(targetPort)) {
        currentStore.addEdge(
          resolvedConnection.source,
          resolvedConnection.sourceHandle,
          resolvedConnection.target,
          resolvedConnection.targetHandle,
        );
      }
    }
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

      const sourceNode = renderNodeMap.get(connection.source);
      const targetNode = renderNodeMap.get(connection.target);
      if (!sourceNode || !targetNode) return false;

      const resolvedConnection = resolveDirectionalGroupConnection(connection, renderNodeMap);
      if (!resolvedConnection) return false;

      const sourceDescriptor = parseGroupHandleId(resolvedConnection.sourceHandle);
      const targetDescriptor = parseGroupHandleId(resolvedConnection.targetHandle);
      const sourceGroupId = getNearestGroupAncestorId(connection.source, renderNodeMap);
      const targetGroupId = getNearestGroupAncestorId(connection.target, renderNodeMap);

      if (!sourceDescriptor && !targetDescriptor && sourceGroupId !== targetGroupId) {
        return false;
      }

      if (
        sourceDescriptor &&
        sourceNode.type === 'group' &&
        sourceDescriptor.side === 'input' &&
        sourceDescriptor.role === 'internal'
      ) {
        const sourcePort = findGroupPort(
          (sourceNode.data || {}) as Record<string, unknown>,
          'input',
          sourceDescriptor.portId,
        );
        if (!sourcePort || sourceNode.id !== getParentId(targetNode) || !resolvedConnection.targetHandle) return false;

        const targetType = getInputType(targetNode, resolvedConnection.targetHandle);
        if (!targetType) return false;

        if (!sourcePort.type) return true;
        const compatibleTargets = PORT_COMPATIBILITY[sourcePort.type];
        return compatibleTargets?.includes(targetType) ?? false;
      }

      if (
        targetDescriptor &&
        targetNode.type === 'group' &&
        targetDescriptor.side === 'output' &&
        targetDescriptor.role === 'internal'
      ) {
        const targetPort = findGroupPort(
          (targetNode.data || {}) as Record<string, unknown>,
          'output',
          targetDescriptor.portId,
        );
        if (!targetPort || targetNode.id !== getParentId(sourceNode) || !resolvedConnection.sourceHandle) return false;
        if (targetPort.insideLinks.length > 0) return false;

        const sourceType = getOutputType(sourceNode, resolvedConnection.sourceHandle);
        if (!sourceType) return false;

        if (!targetPort.type) return true;
        const compatibleTargets = PORT_COMPATIBILITY[sourceType];
        return compatibleTargets?.includes(targetPort.type) ?? false;
      }

      const sourceType = getOutputType(sourceNode, resolvedConnection.sourceHandle);
      const targetType = getInputType(targetNode, resolvedConnection.targetHandle);
      if (!sourceType || !targetType) return false;

      if (sourceDescriptor) {
        if (sourceDescriptor.side !== 'output' || sourceDescriptor.role !== 'external') return false;
        if (!canConnectToGroupHandleExternally(sourceNode, resolvedConnection.sourceHandle)) return false;
      }

      if (targetDescriptor) {
        if (targetDescriptor.side !== 'input' || targetDescriptor.role !== 'external') return false;
        if (!canConnectToGroupHandleExternally(targetNode, resolvedConnection.targetHandle)) return false;
      }

      const compatibleTargets = PORT_COMPATIBILITY[sourceType];
      return compatibleTargets?.includes(targetType) ?? false;
    },
    [renderNodeMap],
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
      const groupDescriptor = parseGroupHandleId(params.handleId);
      if (groupDescriptor && node.type === 'group') {
        const port = findGroupPort(
          (node.data || {}) as Record<string, unknown>,
          groupDescriptor.side,
          groupDescriptor.portId,
        );
        if (!port) {
          pendingConnectionRef.current = null;
          return;
        }

        if (params.handleType === 'source') {
          if (
            groupDescriptor.side === 'output' &&
            groupDescriptor.role === 'external' &&
            !isGroupPortExternallyConnectable(port)
          ) {
            pendingConnectionRef.current = null;
            return;
          }
          pendingConnectionRef.current = {
            allowCreateNode:
              groupDescriptor.side === 'output' &&
              groupDescriptor.role === 'external' &&
              isGroupPortExternallyConnectable(port),
            handleType: 'source',
            sourceId: params.nodeId,
            sourceHandle: params.handleId,
            sourceType: port.type || 'any',
          };
          return;
        }

        if (
          groupDescriptor.side === 'input' &&
          groupDescriptor.role === 'external' &&
          !isGroupPortExternallyConnectable(port)
        ) {
          pendingConnectionRef.current = null;
          return;
        }

        pendingConnectionRef.current = {
          allowCreateNode:
            groupDescriptor.side === 'input' &&
            groupDescriptor.role === 'external' &&
            isGroupPortExternallyConnectable(port),
          handleType: 'target',
          targetId: params.nodeId,
          targetHandle: params.handleId,
          targetType: port.type || 'any',
        };
        return;
      }

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
