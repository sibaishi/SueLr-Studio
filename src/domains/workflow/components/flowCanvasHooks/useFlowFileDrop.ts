import type { DragEvent } from 'react';
import { useCallback } from 'react';
import { getDropNodePosition } from '../flowCanvasClipboard';
import { FLOW_DISABLED_NEW_NODE_TYPES } from '../flowCanvasConfig';
import { buildDefaultData, getDroppedFileNodeType } from '../flowCanvasHelpers';
import type { FlowHookDeps } from './types';

interface UseFlowFileDropDeps extends FlowHookDeps {
  closeContextMenu: () => void;
}

export function useFlowFileDrop({ store, reactFlow, closeContextMenu }: UseFlowFileDropDeps) {
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  }, []);

  const addFilesToCanvas = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      files.forEach((file, index) => {
        const droppedNodeType = getDroppedFileNodeType(file);
        if (!droppedNodeType || FLOW_DISABLED_NEW_NODE_TYPES.has(droppedNodeType)) return;

        const nodeId = store.addNode(
          droppedNodeType,
          getDropNodePosition(droppedNodeType, position, index),
          buildDefaultData(droppedNodeType),
        );

        // All files go to io nodes
        const reader = new FileReader();
        reader.onload = () => {
          import('@/domains/workflow/components/nodes/io/fileRawStore').then(({ fileRawStore }) => {
            const base64 = String(reader.result);
            const kind: string =
              file.type.startsWith('video/') ? 'video' :
              file.type.startsWith('audio/') ? 'audio' :
              'image';
            const id = fileRawStore.add(file, file.name, base64);
            store.updateNodeData(nodeId, {
              content: [fileRawStore.get(id)!.objectUrl],
              _fileIds: [id],
              _fileKinds: [kind],
              _fileOrder: [id],
            });
          });
        };
        reader.readAsDataURL(file);
      });
    },
    [store],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (nodeType && !FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) {
        store.addNode(nodeType, position, buildDefaultData(nodeType));
        return;
      }

      if (nodeType && FLOW_DISABLED_NEW_NODE_TYPES.has(nodeType)) {
        closeContextMenu();
        return;
      }

      const files = Array.from(event.dataTransfer.files || []);
      if (files.length === 0) return;

      addFilesToCanvas(files, position);
    },
    [addFilesToCanvas, closeContextMenu, reactFlow, store],
  );

  return {
    addFilesToCanvas,
    onDragOver,
    onDrop,
  };
}
