import type { PreviewImageItem } from '@/domains/workflow/components/ImagePreviewModal';
import { getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { serializeWorkflowExport } from '@/domains/workflow/lib/importExport';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';
import type { NodeTypeDef } from '@/domains/workflow/lib/types';
import type { Edge, Node } from '@xyflow/react';
import { useCallback, useRef } from 'react';

const DISABLED_NEW_NODE_TYPES = new Set<string>();

type PageCommandStore = {
  workflowId: string;
  workflowName: string;
  workflowList: Array<{ id: string; name: string }>;
  nodes: Node[];
  edges: Edge[];
  addNode: (type: string, position: { x: number; y: number }, data?: Record<string, unknown>) => string;
  cancelWorkflowExecution: () => Promise<void>;
  createNodeGroup: (nodeIds: string[]) => string | null;
  deleteCurrentWorkflowDetailed: () => Promise<{ success: true } | { success: false; message: string }>;
  duplicateCurrentWorkflowDetailed: () => Promise<{ success: true } | { success: false; message: string }>;
  executeWorkflow: () => Promise<void>;
  exportCurrentWorkflow: () => PersistedWorkflow;
  loadWorkflowDetailed: (workflowId: string) => Promise<{ success: true } | { success: false; message: string }>;
  newWorkflow: () => void;
  saveWorkflowDetailed: () => Promise<{ success: true } | { success: false; message: string }>;
};

function formatWorkflowActionError(action: string, message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `${action}没有完成，请稍后重试。${detail}` : `${action}没有完成，请稍后重试。`;
}

export function useWorkflowPageCommands({
  store,
  resetHistory,
  setWorkflowErrorMessage,
}: {
  store: PageCommandStore;
  confirmDiscardChanges: (actionLabel: string) => boolean;
  resetHistory: () => void;
  setWorkflowErrorMessage: (message: string | null) => void;
}) {
  const viewportCenterRef = useRef<{ x: number; y: number } | null>(null);

  const handleAddNode = useCallback(
    (nodeTypeDef: NodeTypeDef) => {
      if (DISABLED_NEW_NODE_TYPES.has(nodeTypeDef.type)) return;
      const center = viewportCenterRef.current || { x: 300, y: 200 };
      const size = getNodeDefaultSize(nodeTypeDef.type);
      const stagger = (store.nodes.length % 5) * 24;
      store.addNode(nodeTypeDef.type, {
        x: center.x - size.w / 2 + stagger,
        y: center.y - size.h / 2 + stagger,
      });
    },
    [store],
  );

  const handleViewportCenterChange = useCallback((position: { x: number; y: number }) => {
    viewportCenterRef.current = position;
  }, []);

  const handleBackfillImageToCanvas = useCallback(
    (image: PreviewImageItem) => {
      const center = viewportCenterRef.current || { x: 300, y: 200 };
      const size = getNodeDefaultSize('imageInput');
      const stagger = (store.nodes.length % 5) * 24;
      const name = image.name || 'image';
      store.addNode(
        'imageInput',
        {
          x: center.x - size.w / 2 + stagger,
          y: center.y - size.h / 2 + stagger,
        },
        {
          fileUrl: image.src,
          previewUrl: image.src,
          localPath: name,
          fileName: name,
          fileKind: 'image',
          _uploading: false,
          _uploadError: '',
          canvasOriginalFileUrl: '',
          canvasOriginalPreviewUrl: '',
          canvasOriginalFileName: '',
          canvasOriginalFileSize: undefined,
        },
      );
    },
    [store],
  );

  const handleBackfillVideoToCanvas = useCallback(
    (video: { src: string; name?: string }) => {
      const center = viewportCenterRef.current || { x: 300, y: 200 };
      const size = getNodeDefaultSize('videoInput');
      const stagger = (store.nodes.length % 5) * 24;
      const name = video.name || 'video';
      store.addNode(
        'videoInput',
        {
          x: center.x - size.w / 2 + stagger,
          y: center.y - size.h / 2 + stagger,
        },
        {
          fileUrl: video.src,
          previewUrl: video.src,
          localPath: name,
          fileName: name,
          fileKind: 'video',
          _uploading: false,
          _uploadError: '',
        },
      );
    },
    [store],
  );

  const handleBackfillTextToCanvas = useCallback(
    (text: string) => {
      const center = viewportCenterRef.current || { x: 300, y: 200 };
      const size = getNodeDefaultSize('textInput');
      const stagger = (store.nodes.length % 5) * 24;
      store.addNode(
        'textInput',
        {
          x: center.x - size.w / 2 + stagger,
          y: center.y - size.h / 2 + stagger,
        },
        { text },
      );
    },
    [store],
  );

  const handleSave = useCallback(async () => {
    const result = await store.saveWorkflowDetailed();
    if (!result.success) {
      setWorkflowErrorMessage(formatWorkflowActionError('保存工作流', result.message));
      return;
    }
    setWorkflowErrorMessage(null);
  }, [setWorkflowErrorMessage, store]);

  const handleExecute = useCallback(async () => {
    await store.executeWorkflow();
  }, [store]);

  const handleCreateSelectedNodeGroup = useCallback(() => {
    const selectedNodeIds = store.nodes.filter((node) => node.selected).map((node) => node.id);
    if (selectedNodeIds.length < 2) return;
    store.createNodeGroup(selectedNodeIds);
  }, [store]);

  const handleCancelExecution = useCallback(async () => {
    await store.cancelWorkflowExecution();
  }, [store]);

  const handleNewWorkflow = useCallback(() => {
    store.newWorkflow();
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [resetHistory, setWorkflowErrorMessage, store]);

  const handleSelectWorkflow = useCallback(
    async (workflowId: string) => {
      if (!workflowId || workflowId === store.workflowId) return;
      const result = await store.loadWorkflowDetailed(workflowId);
      if (!result.success) {
        setWorkflowErrorMessage(formatWorkflowActionError('加载工作流', result.message));
        return;
      }
      setWorkflowErrorMessage(null);
      resetHistory();
    },
    [resetHistory, setWorkflowErrorMessage, store],
  );

  const handleDuplicateWorkflow = useCallback(async () => {
    const result = await store.duplicateCurrentWorkflowDetailed();
    if (!result.success) {
      setWorkflowErrorMessage(formatWorkflowActionError('复制工作流', result.message));
      return;
    }
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [resetHistory, setWorkflowErrorMessage, store]);

  const handleDeleteWorkflow = useCallback(async () => {
    const workflowLabel = store.workflowName || '当前工作流';
    const isSavedWorkflow = store.workflowList.some((workflow) => workflow.id === store.workflowId);
    const scopeCopy = isSavedWorkflow
      ? '将从工作流库中删除已保存记录。已打开的标签页会变为未保存草稿。'
      : '当前内容还没有保存到工作流库。';
    const confirmed = window.confirm(`确定要删除“${workflowLabel}”吗？\n\n${scopeCopy}\n此操作不可撤销。`);
    if (!confirmed) return;

    const result = await store.deleteCurrentWorkflowDetailed();
    if (!result.success) {
      setWorkflowErrorMessage(formatWorkflowActionError('删除工作流', result.message));
      return;
    }
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [resetHistory, setWorkflowErrorMessage, store]);

  const handleExportWorkflow = useCallback(() => {
    const payload = store.exportCurrentWorkflow();
    const safeName = (payload.name || 'workflow').replace(/[\\/:*?"<>|]/g, '-').trim() || 'workflow';
    const blob = new Blob([serializeWorkflowExport(payload)], {
      type: 'application/json;charset=utf-8',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }, [store]);

  return {
    handleAddNode,
    handleViewportCenterChange,
    handleBackfillImageToCanvas,
    handleBackfillVideoToCanvas,
    handleBackfillTextToCanvas,
    handleSave,
    handleExecute,
    handleCreateSelectedNodeGroup,
    handleCancelExecution,
    handleNewWorkflow,
    handleSelectWorkflow,
    handleDuplicateWorkflow,
    handleDeleteWorkflow,
    handleExportWorkflow,
  };
}
