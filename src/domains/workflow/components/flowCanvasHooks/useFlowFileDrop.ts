import { uploadFile } from '@/domains/workflow/lib/api';
import { waitForUploadedImageMetadata } from '@/domains/workflow/lib/uploadProcessing';
import type { DragEvent } from 'react';
import { useCallback } from 'react';
import { getDropNodePosition } from '../flowCanvasClipboard';
import { FLOW_DISABLED_NEW_NODE_TYPES } from '../flowCanvasConfig';
import { buildDefaultData, getDroppedFileNodeType } from '../flowCanvasHelpers';
import { formatCanvasUploadError } from '../flowCanvasText';
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

        if (droppedNodeType === 'textInput') {
          void file
            .text()
            .then((text) => {
              store.updateNodeData(nodeId, { text });
            })
            .catch((error) => {
              store.updateNodeData(nodeId, {
                text: `导入文本没有完成，请检查文件编码或稍后重试。${error instanceof Error ? error.message : ''}`,
              });
            });
          return;
        }

        const localPreview = URL.createObjectURL(file);
        store.updateNodeData(nodeId, {
          fileUrl: '',
          thumbnailUrl: '',
          previewUrl: localPreview,
          localPath: file.webkitRelativePath || file.name,
          fileName: file.name,
          fileKind: droppedNodeType === 'imageInput' ? 'image' : droppedNodeType === 'videoInput' ? 'video' : 'audio',
          fileSize: file.size,
          _uploading: true,
          _uploadError: '',
          _fileProcessingStatus: '',
          _fileProcessingError: '',
          canvasOriginalFileUrl: '',
          canvasOriginalPreviewUrl: '',
          canvasOriginalFileName: '',
          canvasOriginalFileSize: undefined,
        });

        void uploadFile(file)
          .then((result) => {
            if (result.success && result.url) {
              store.updateNodeData(nodeId, {
                fileUrl: result.url,
                thumbnailUrl: result.thumbnailUrl || '',
                previewUrl: result.thumbnailUrl || localPreview,
                fileName: result.fileName || file.name,
                fileSize: result.fileSize || file.size,
                _uploading: false,
                _uploadError: '',
                _fileProcessingStatus: result.processing ? 'processing' : '',
                _fileProcessingError: result.processingError || '',
              });
              if (result.processing && result.url) {
                void waitForUploadedImageMetadata(result.url, (metadata) => {
                  if (metadata.thumbnailUrl || metadata.url) {
                    URL.revokeObjectURL(localPreview);
                  }
                  store.updateNodeData(nodeId, {
                    fileUrl: metadata.url || result.url,
                    thumbnailUrl: metadata.thumbnailUrl || '',
                    previewUrl: metadata.thumbnailUrl || metadata.url || result.url,
                    width: metadata.width,
                    height: metadata.height,
                    _fileProcessingStatus: metadata.processingStatus || '',
                    _fileProcessingError: metadata.processingError || '',
                  });
                });
              } else if (result.thumbnailUrl || result.url) {
                URL.revokeObjectURL(localPreview);
              }
              return;
            }

            URL.revokeObjectURL(localPreview);
            store.updateNodeData(nodeId, {
              previewUrl: '',
              _uploading: false,
              _uploadError: formatCanvasUploadError(result.error),
              _fileProcessingStatus: '',
              _fileProcessingError: '',
            });
          })
          .catch((error) => {
            URL.revokeObjectURL(localPreview);
            store.updateNodeData(nodeId, {
              previewUrl: '',
              _uploading: false,
              _uploadError: formatCanvasUploadError(error instanceof Error ? error.message : ''),
              _fileProcessingStatus: '',
              _fileProcessingError: '',
            });
          });
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
