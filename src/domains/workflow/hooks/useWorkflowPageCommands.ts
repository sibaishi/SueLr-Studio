import type { WorkflowConfirmRequest } from '@/domains/workflow/components/WorkflowConfirmDialog';
import { getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { downloadBlob, safeArchiveName } from '@/domains/workflow/lib/fileArchive';
import { exportWorkflowArchive, getWorkflowAssetReferences } from '@/domains/workflow/lib/workflowArchive';
import { serializeWorkflowExport } from '@/domains/workflow/lib/importExport';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';
import type { NodeTypeDef } from '@/domains/workflow/lib/types';
import type { Edge, Node } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

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

type ConfirmWorkflowAction = (request: WorkflowConfirmRequest) => Promise<boolean>;

function formatWorkflowActionError(action: string, message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `${action}没有完成，请稍后重试。${detail}` : `${action}没有完成，请稍后重试。`;
}

export function useWorkflowPageCommands({
  store,
  resetHistory,
  setWorkflowErrorMessage,
  confirm,
}: {
  store: PageCommandStore;
  resetHistory: () => void;
  setWorkflowErrorMessage: (message: string | null) => void;
  confirm: ConfirmWorkflowAction;
}) {
  const viewportCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [exportRequest, setExportRequest] = useState<{
    workflow: PersistedWorkflow;
    name: string;
    references: string[];
  } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

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
    const confirmed = await confirm({
      title: `删除“${workflowLabel}”？`,
      message: `${scopeCopy}\n此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    });
    if (!confirmed) return;

    const result = await store.deleteCurrentWorkflowDetailed();
    if (!result.success) {
      setWorkflowErrorMessage(formatWorkflowActionError('删除工作流', result.message));
      return;
    }
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [confirm, resetHistory, setWorkflowErrorMessage, store]);

  const handleExportWorkflow = useCallback(() => {
    const workflow = store.exportCurrentWorkflow();
    const name = safeArchiveName(workflow.name || 'workflow');
    const references = getWorkflowAssetReferences(workflow);
    setExportError('');
    if (references.length > 0) {
      setExportRequest({ workflow, name, references });
      return;
    }
    downloadBlob(new Blob([serializeWorkflowExport(workflow)], { type: 'application/json' }), `${name}.json`);
  }, [store]);

  const closeExport = useCallback(() => {
    if (!exportBusy) setExportRequest(null);
  }, [exportBusy]);

  const downloadExport = useCallback(async (withMedia: boolean) => {
    if (!exportRequest || exportBusy) return;
    const { workflow, name, references } = exportRequest;
    setExportBusy(true);
    setExportError('');
    try {
      if (withMedia) {
        await exportWorkflowArchive(workflow, name, references);
      } else {
        downloadBlob(new Blob([serializeWorkflowExport(workflow)], { type: 'application/json' }), `${name}.json`);
      }
      setExportRequest(null);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出没有完成，请稍后重试。');
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, exportRequest]);

  return {
    handleAddNode,
    handleViewportCenterChange,
    handleSave,
    handleExecute,
    handleCreateSelectedNodeGroup,
    handleCancelExecution,
    handleNewWorkflow,
    handleSelectWorkflow,
    handleDuplicateWorkflow,
    handleDeleteWorkflow,
    handleExportWorkflow,
    exportRequest,
    exportBusy,
    exportError,
    closeExport,
    downloadExport,
  };
}
