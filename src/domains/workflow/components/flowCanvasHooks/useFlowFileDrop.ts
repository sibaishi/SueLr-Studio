import { uploadFile } from '@/domains/workflow/lib/api/files';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { Node as FlowNodeType } from '@xyflow/react';
import type { DragEvent } from 'react';
import { useCallback } from 'react';
import { getNodeRenderRect } from '../flowCanvasClipboard';
import { FLOW_DISABLED_NEW_NODE_TYPES } from '../flowCanvasConfig';
import { buildDefaultData, getCenteredPosition, getDroppedFileNodeType } from '../flowCanvasHelpers';
import type { FlowHookDeps } from './types';

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const isTextFile = (file: File) =>
  TEXT_EXTENSIONS.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json';

interface UseFlowFileDropDeps extends FlowHookDeps {
  closeContextMenu: () => void;
}

type DroppedMediaFile = {
  file: File;
  id: number;
  kind: string;
  name: string;
  url: string;
};

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getFileKind(file: File) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}

function isStartIoNode(node: FlowNodeType | undefined, edges: { target: string }[]) {
  return Boolean(node && node.type === 'io' && !edges.some((edge) => edge.target === node.id));
}

function getTopNodeAtPosition(nodes: FlowNodeType[], position: { x: number; y: number }) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const node of [...nodes].reverse()) {
    const rect = getNodeRenderRect(node, nodeMap);
    const isInside =
      position.x >= rect.x &&
      position.x <= rect.x + rect.width &&
      position.y >= rect.y &&
      position.y <= rect.y + rect.height;
    if (isInside) return node;
  }
  return undefined;
}

function uploadDroppedMediaFile(nodeId: string, mediaFile: DroppedMediaFile) {
  uploadFile(mediaFile.file)
    .then((result) => {
      if (!result.success || !result.url) return;

      const latestState = useWorkflowStore.getState();
      const node = latestState.nodes.find((item) => item.id === nodeId);
      const nodeData = (node?.data || {}) as Record<string, unknown>;
      const fileIds = Array.isArray(nodeData._fileIds) ? [...(nodeData._fileIds as number[])] : [];
      const index = fileIds.indexOf(mediaFile.id);
      if (index < 0) return;

      const content = Array.isArray(nodeData.content) ? [...(nodeData.content as string[])] : [];
      const fileNames = Array.isArray(nodeData._fileNames) ? [...(nodeData._fileNames as string[])] : [];
      while (content.length < fileIds.length) content.push('');
      while (fileNames.length < fileIds.length) fileNames.push('');
      content[index] = result.url;
      fileNames[index] = result.fileName || mediaFile.name;

      latestState.updateNodeData(nodeId, {
        content,
        _fileNames: fileNames,
      });
    })
    .catch(() => {
      // Keep the local raw-store object URL usable for the current session.
    });
}

export function useFlowFileDrop({ store, reactFlow, closeContextMenu }: UseFlowFileDropDeps) {
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  }, []);

  const addFilesToCanvas = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      const acceptedFiles = files.filter((file) => {
        const droppedNodeType = getDroppedFileNodeType(file);
        return droppedNodeType === 'io' && !FLOW_DISABLED_NEW_NODE_TYPES.has(droppedNodeType);
      });
      if (acceptedFiles.length === 0) return;

      const dropTarget = getTopNodeAtPosition(store.nodes as FlowNodeType[], position);
      const targetNodeId =
        isStartIoNode(dropTarget, store.edges) && dropTarget
          ? dropTarget.id
          : store.addNode('io', getCenteredPosition('io', position), buildDefaultData('io'));

      store.selectNode(null);

      void (async () => {
        const textParts: string[] = [];
        const mediaFiles: DroppedMediaFile[] = [];
        const mediaFileInputs = acceptedFiles.filter((file) => !isTextFile(file));
        const fileRawStoreModule =
          mediaFileInputs.length > 0 ? await import('@/domains/workflow/components/nodes/io/fileRawStore') : null;

        for (const file of acceptedFiles) {
          if (isTextFile(file)) {
            const text = await readFileAsText(file);
            textParts.push(`[${file.name}]\n${text}`);
            continue;
          }

          if (!fileRawStoreModule) continue;
          const base64 = await readFileAsDataUrl(file);
          const id = fileRawStoreModule.fileRawStore.add(file, file.name, base64);
          const record = fileRawStoreModule.fileRawStore.get(id);
          if (!record) continue;
          mediaFiles.push({
            file,
            id,
            kind: getFileKind(file),
            name: file.name,
            url: record.objectUrl,
          });
        }

        const latestState = useWorkflowStore.getState();
        const node = latestState.nodes.find((item) => item.id === targetNodeId);
        const currentData = (node?.data || {}) as Record<string, unknown>;
        const currentText = String(currentData.text || '');
        const currentContent = Array.isArray(currentData.content) ? (currentData.content as string[]) : [];
        const currentFileIds = Array.isArray(currentData._fileIds) ? (currentData._fileIds as number[]) : [];
        const currentFileKinds = Array.isArray(currentData._fileKinds) ? (currentData._fileKinds as string[]) : [];
        const currentFileOrder = Array.isArray(currentData._fileOrder) ? (currentData._fileOrder as number[]) : [];
        const currentFileNames = Array.isArray(currentData._fileNames) ? (currentData._fileNames as string[]) : [];

        latestState.updateNodeData(targetNodeId, {
          text: [...(currentText ? [currentText] : []), ...textParts].join('\n'),
          content: [...currentContent, ...mediaFiles.map((file) => file.url)],
          _fileIds: [...currentFileIds, ...mediaFiles.map((file) => file.id)],
          _fileKinds: [...currentFileKinds, ...mediaFiles.map((file) => file.kind)],
          _fileOrder: [...currentFileOrder, ...mediaFiles.map((file) => file.id)],
          _fileNames: [...currentFileNames, ...mediaFiles.map((file) => file.name)],
        });
        latestState.selectNode(targetNodeId);

        for (const mediaFile of mediaFiles) {
          uploadDroppedMediaFile(targetNodeId, mediaFile);
        }
      })();
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
