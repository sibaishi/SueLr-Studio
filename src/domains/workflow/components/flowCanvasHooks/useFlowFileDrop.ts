import type { DragEvent } from 'react';
import { useCallback } from 'react';
import { getDropNodePosition } from '../flowCanvasClipboard';
import { FLOW_DISABLED_NEW_NODE_TYPES } from '../flowCanvasConfig';
import { buildDefaultData, getDroppedFileNodeType } from '../flowCanvasHelpers';
import type { FlowHookDeps } from './types';

const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const isTextFile = (file: File) => TEXT_EXTENSIONS.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json';

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

        // Text files: read content into the text field, don't create a file entry
        if (isTextFile(file)) {
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result);
            store.updateNodeData(nodeId, { text: `[${file.name}]\n${text}` });
          };
          reader.readAsText(file);
          return;
        }

        // Media files: store as file entry
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
              _fileNames: [file.name],
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
