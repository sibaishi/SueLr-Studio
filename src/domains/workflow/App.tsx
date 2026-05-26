import FlowCanvas from '@/domains/workflow/components/FlowCanvas';
import type { PreviewImageItem } from '@/domains/workflow/components/ImagePreviewModal';
import ResultsPanel from '@/domains/workflow/components/ResultsPanel';
import Sidebar from '@/domains/workflow/components/Sidebar';
import StatusBar from '@/domains/workflow/components/StatusBar';
import Toolbar from '@/domains/workflow/components/Toolbar';
import WorkflowImportConflictModal from '@/domains/workflow/components/WorkflowImportConflictModal';
import WorkflowImportReportModal from '@/domains/workflow/components/WorkflowImportReportModal';
import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { resolveWorkflowShortcutAction } from '@/domains/workflow/lib/hotkeys';
import {
  buildImportConflictMessage,
  getSuggestedImportModes,
  parseWorkflowImport,
  serializeWorkflowExport,
} from '@/domains/workflow/lib/importExport';
import type { WorkflowImportError, WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { type WorkflowEditorSnapshot, useWorkflowStore } from '@/domains/workflow/lib/store';
import { useWorkflowPageStore } from '@/domains/workflow/lib/store/selectors';
import type { NodeTypeDef } from '@/domains/workflow/lib/types';
import { Boxes } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DISABLED_NEW_NODE_TYPES = new Set<string>();

interface WorkflowPageProps {
  onOpenStudioSettings?: () => void;
}

function buildSnapshot(
  store: Pick<WorkflowEditorSnapshot, 'workflowId' | 'workflowName' | 'nodes' | 'edges' | 'selectedNodeId'>,
): WorkflowEditorSnapshot {
  return {
    workflowId: store.workflowId,
    workflowName: store.workflowName,
    nodes: store.nodes,
    edges: store.edges,
    selectedNodeId: store.selectedNodeId,
  };
}

function snapshotSignature(snapshot: WorkflowEditorSnapshot) {
  return JSON.stringify({
    workflowId: snapshot.workflowId,
    workflowName: snapshot.workflowName,
    selectedNodeId: snapshot.selectedNodeId,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  });
}

function formatWorkflowImportError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `导入工作流失败，请检查文件内容或更换导入模式。${detail}`
    : '导入工作流失败，请检查文件内容或更换导入模式。';
}

function formatWorkflowActionError(action: string, message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `${action}没有完成，请稍后重试。${detail}` : `${action}没有完成，请稍后重试。`;
}

export default function WorkflowPage({ onOpenStudioSettings }: WorkflowPageProps) {
  return <WorkflowPageContent onOpenStudioSettings={onOpenStudioSettings} />;
}

function WorkflowPageContent({ onOpenStudioSettings }: WorkflowPageProps) {
  const store = useWorkflowPageStore();
  const viewportCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [importReport, setImportReport] = useState<WorkflowImportReport | null>(null);
  const [importReportFileName, setImportReportFileName] = useState<string>('');
  const [importConflict, setImportConflict] = useState<WorkflowImportError | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [workflowErrorMessage, setWorkflowErrorMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImportRef = useRef<{ payload: Record<string, unknown>; fallbackName: string; fileName: string } | null>(
    null,
  );
  const historyPastRef = useRef<WorkflowEditorSnapshot[]>([]);
  const historyFutureRef = useRef<WorkflowEditorSnapshot[]>([]);
  const currentSnapshotRef = useRef<WorkflowEditorSnapshot | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const isApplyingHistoryRef = useRef(false);

  const syncHistoryState = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);

  useEffect(() => {
    void useWorkflowStore.getState().initializeWorkflowPersistence();
  }, []);

  useEffect(() => {
    void useWorkflowStore.getState().restoreExecutionRun();
  }, []);

  useEffect(() => {
    if (!store.currentRunId) return;

    const timer = window.setInterval(() => {
      void useWorkflowStore.getState().syncExecutionRunStatus();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [store.currentRunId]);

  useEffect(() => {
    store.persistLocalDraft();
  }, [store.workflowId, store.workflowName, store.nodes, store.edges]);

  useEffect(() => {
    if (store.isHydratingWorkflow || isApplyingHistoryRef.current) return;

    const nextSnapshot = buildSnapshot(store);
    if (!currentSnapshotRef.current) {
      currentSnapshotRef.current = nextSnapshot;
      syncHistoryState();
      return;
    }

    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
    }

    historyTimerRef.current = window.setTimeout(() => {
      const current = currentSnapshotRef.current;
      if (!current) {
        currentSnapshotRef.current = nextSnapshot;
        syncHistoryState();
        return;
      }

      if (snapshotSignature(current) === snapshotSignature(nextSnapshot)) return;

      const latestPast = historyPastRef.current[historyPastRef.current.length - 1];
      if (!latestPast || snapshotSignature(latestPast) !== snapshotSignature(current)) {
        historyPastRef.current.push(current);
      }
      if (historyPastRef.current.length > 80) historyPastRef.current.shift();
      historyFutureRef.current = [];
      currentSnapshotRef.current = nextSnapshot;
      syncHistoryState();
    }, 180);

    return () => {
      if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current);
    };
  }, [
    store.workflowId,
    store.workflowName,
    store.nodes,
    store.edges,
    store.selectedNodeId,
    store.isHydratingWorkflow,
    syncHistoryState,
  ]);

  const applyHistorySnapshot = useCallback(
    (snapshot: WorkflowEditorSnapshot) => {
      isApplyingHistoryRef.current = true;
      store.applyEditorSnapshot(snapshot, true);
      store.persistLocalDraft();
      currentSnapshotRef.current = snapshot;
      window.setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [store],
  );

  const handleUndo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;
    const current = currentSnapshotRef.current || buildSnapshot(store);
    historyFutureRef.current.unshift(current);
    applyHistorySnapshot(previous);
    syncHistoryState();
  }, [applyHistorySnapshot, store, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const next = historyFutureRef.current.shift();
    if (!next) return;
    const current = currentSnapshotRef.current || buildSnapshot(store);
    historyPastRef.current.push(current);
    applyHistorySnapshot(next);
    syncHistoryState();
  }, [applyHistorySnapshot, store, syncHistoryState]);

  const captureImmediateHistory = useCallback(() => {
    if (store.isHydratingWorkflow || isApplyingHistoryRef.current) return;
    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const currentSnapshot = buildSnapshot(store);
    const previousSnapshot = currentSnapshotRef.current;
    if (!previousSnapshot) {
      currentSnapshotRef.current = currentSnapshot;
      syncHistoryState();
      return;
    }

    const latestPast = historyPastRef.current[historyPastRef.current.length - 1];
    if (latestPast && snapshotSignature(latestPast) === snapshotSignature(currentSnapshot)) return;
    historyPastRef.current.push(currentSnapshot);
    if (historyPastRef.current.length > 80) historyPastRef.current.shift();
    historyFutureRef.current = [];
    currentSnapshotRef.current = currentSnapshot;
    syncHistoryState();
  }, [store, syncHistoryState]);

  const confirmDiscardChanges = useCallback(
    (actionLabel: string) => {
      if (!store.hasUnsavedChanges) return true;
      return window.confirm(`当前工作流还有未保存修改，确定要继续${actionLabel}吗？未保存的修改会保留在本地草稿中。`);
    },
    [store.hasUnsavedChanges],
  );

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
        {
          text,
        },
      );
    },
    [store],
  );

  const handleSave = useCallback(async () => {
    const success = await store.saveWorkflow();
    if (!success) {
      setWorkflowErrorMessage(formatWorkflowActionError('保存工作流'));
      return;
    }
    setWorkflowErrorMessage(null);
  }, [store]);

  const handleExecute = useCallback(async () => {
    await store.executeWorkflow();
  }, [store]);

  const handleCreateSelectedNodeGroup = useCallback(() => {
    const selectedNodeIds = store.nodes.filter((node) => node.selected).map((node) => node.id);
    if (selectedNodeIds.length < 2) return;
    store.createNodeGroup(selectedNodeIds);
  }, [store]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable) return;

      const action = resolveWorkflowShortcutAction(event);
      if (!action) return;

      event.preventDefault();

      if (action === 'group') {
        handleCreateSelectedNodeGroup();
        return;
      }

      if (action === 'run') {
        void handleExecute();
        return;
      }

      if (action === 'undo') {
        handleUndo();
        return;
      }

      if (action === 'redo') {
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateSelectedNodeGroup, handleExecute, handleRedo, handleUndo]);

  const handleCancelExecution = useCallback(async () => {
    await store.cancelWorkflowExecution();
  }, [store]);

  const resetHistory = useCallback(() => {
    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const handleNewWorkflow = useCallback(() => {
    if (!confirmDiscardChanges('新建工作流')) return;
    store.newWorkflow();
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [confirmDiscardChanges, resetHistory, store]);

  const handleSelectWorkflow = useCallback(
    async (workflowId: string) => {
      if (!workflowId || workflowId === store.workflowId) return;
      if (!confirmDiscardChanges('切换工作流')) return;
      const success = await store.loadWorkflow(workflowId);
      if (!success) {
        setWorkflowErrorMessage(formatWorkflowActionError('加载工作流'));
        return;
      }
      setWorkflowErrorMessage(null);
      resetHistory();
    },
    [confirmDiscardChanges, resetHistory, store],
  );

  const handleDuplicateWorkflow = useCallback(async () => {
    const success = await store.duplicateCurrentWorkflow();
    if (!success) {
      setWorkflowErrorMessage(formatWorkflowActionError('复制工作流'));
      return;
    }
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [resetHistory, store]);

  const handleDeleteWorkflow = useCallback(async () => {
    const workflowLabel = store.workflowName || '当前工作流';
    const confirmed = window.confirm(`确定要删除“${workflowLabel}”吗？此操作不可撤销。`);
    if (!confirmed) return;

    const success = await store.deleteCurrentWorkflow();
    if (!success) {
      setWorkflowErrorMessage(formatWorkflowActionError('删除工作流'));
      return;
    }
    setWorkflowErrorMessage(null);
    resetHistory();
  }, [resetHistory, store]);

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

  const handleImportClick = useCallback(() => {
    if (!confirmDiscardChanges('导入工作流')) return;
    importInputRef.current?.click();
  }, [confirmDiscardChanges]);

  const handleImportWorkflow = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const content = await file.text();
        const parsed = parseWorkflowImport(content);
        const fallbackName = file.name.replace(/\.json$/i, '');
        pendingImportRef.current = { payload: parsed, fallbackName, fileName: file.name };
        setImportErrorMessage(null);
        const result = await store.importWorkflowData(parsed, fallbackName);
        if (!result.success) {
          const conflictMessage = buildImportConflictMessage(result.error);
          if (conflictMessage) {
            setImportConflict(result.error || null);
            setImportReport(null);
            setImportReportFileName(file.name);
            return;
          }
          setImportErrorMessage(formatWorkflowImportError(result.error?.message || '文件格式不正确。'));
          return;
        }
        setImportConflict(null);
        setImportErrorMessage(null);
        setWorkflowErrorMessage(null);
        setImportReport(result.report || null);
        setImportReportFileName(file.name);
        resetHistory();
      } catch (error) {
        setImportErrorMessage(
          formatWorkflowImportError(error instanceof Error ? error.message : '无法读取或解析 JSON 文件。'),
        );
      }
    },
    [resetHistory, store],
  );

  const toolbarExecutingNodeLabel = useMemo(() => {
    if (!store.executingNodeId) return undefined;
    const activeNode = store.nodes.find((node) => node.id === store.executingNodeId);
    if (!activeNode) return undefined;
    const baseLabel = getNodeDef(activeNode.type || '')?.label || activeNode.type || '未知节点';
    const sameTypeNodes = store.nodes.filter((node) => node.type === activeNode.type);
    if (sameTypeNodes.length <= 1) return baseLabel;
    const index = sameTypeNodes.findIndex((node) => node.id === activeNode.id);
    return index >= 0 ? `${baseLabel} ${index + 1}` : baseLabel;
  }, [store.executingNodeId, store.nodes]);

  return (
    <div className="workflow-page flex h-full w-full min-w-0 flex-col overflow-hidden" data-testid="workflow-page">
      <Toolbar
        workflowId={store.workflowId}
        workflowName={store.workflowName}
        workflows={store.workflowList}
        onWorkflowNameChange={store.setWorkflowName}
        onNewWorkflow={handleNewWorkflow}
        onSelectWorkflow={handleSelectWorkflow}
        onDuplicateWorkflow={handleDuplicateWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onImportWorkflow={handleImportClick}
        onExportWorkflow={handleExportWorkflow}
        onAutoArrange={store.autoArrangeWorkflow}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={handleSave}
        onExecute={handleExecute}
        onCancelExecution={handleCancelExecution}
        onSettings={() => {
          if (onOpenStudioSettings) {
            onOpenStudioSettings();
            return;
          }
          return;
        }}
        onToggleLeftPanel={() => setLeftPanelCollapsed((value) => !value)}
        onToggleRightPanel={() => setRightPanelCollapsed((value) => !value)}
        leftPanelCollapsed={leftPanelCollapsed}
        rightPanelCollapsed={rightPanelCollapsed}
        onToggleSnapToGrid={() => store.setSnapToGridEnabled(!store.snapToGridEnabled)}
        snapToGridEnabled={store.snapToGridEnabled}
        isExecuting={store.isExecuting}
        isSavingWorkflow={store.isSavingWorkflow}
        hasUnsavedChanges={store.hasUnsavedChanges}
        lastSavedAt={store.lastSavedAt}
        executionMessage={store.executionMessage ?? undefined}
        executionProgress={store.executionProgress ?? undefined}
        executingNodeLabel={toolbarExecutingNodeLabel}
      />

      <div className="workflow-shell flex min-h-0 flex-1 overflow-hidden">
        {!leftPanelCollapsed && <Sidebar onAddNode={handleAddNode} />}

        <div className="workflow-workbench glass min-w-0 flex-1 overflow-hidden">
          <div className="workflow-canvas-surface relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <FlowCanvas
              onViewportCenterChange={handleViewportCenterChange}
              onBeforeCanvasEditorSave={captureImmediateHistory}
            />
            {!store.isHydratingWorkflow && store.nodes.length === 0 && <EmptyCanvasHint />}
          </div>
        </div>

        {!rightPanelCollapsed && (
          <ResultsPanel onBackfillImage={handleBackfillImageToCanvas} onBackfillText={handleBackfillTextToCanvas} />
        )}
      </div>

      {importErrorMessage && (
        <div className="px-4 pb-3">
          <div className="workflow-empty-state" style={{ pointerEvents: 'auto' }}>
            <div className="workflow-empty-state__title">导入没有完成</div>
            <div className="workflow-empty-state__body">{importErrorMessage}</div>
            <button
              type="button"
              onClick={() => setImportErrorMessage(null)}
              className="node-secondary-button"
              style={{ marginTop: 12, alignSelf: 'center' }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {workflowErrorMessage && (
        <div className="px-4 pb-3">
          <div className="workflow-empty-state" style={{ pointerEvents: 'auto' }}>
            <div className="workflow-empty-state__title">操作没有完成</div>
            <div className="workflow-empty-state__body">{workflowErrorMessage}</div>
            <button
              type="button"
              onClick={() => setWorkflowErrorMessage(null)}
              className="node-secondary-button"
              style={{ marginTop: 12, alignSelf: 'center' }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      <StatusBar
        nodeCount={store.nodes.length}
        edgeCount={store.edges.length}
        isExecuting={store.isExecuting}
        executionMessage={store.executionMessage}
        currentRunId={store.currentRunId}
        lastExecutionStatus={store.lastExecutionStatus}
        lastExecutionTime={store.lastExecutionTime ?? undefined}
        lastExecutionError={store.lastExecutionError}
        lastExecutionSummary={store.lastExecutionSummary}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {importConflict && (
        <WorkflowImportConflictModal
          fileName={importReportFileName}
          conflict={importConflict}
          retryModes={getSuggestedImportModes(importConflict.details)}
          onClose={() => setImportConflict(null)}
          onRetry={async (mode) => {
            const pending = pendingImportRef.current;
            if (!pending) return;
            const result = await store.importWorkflowDataWithMode(pending.payload, mode, pending.fallbackName);
            if (!result.success) {
              const nextConflictMessage = buildImportConflictMessage(result.error);
              if (nextConflictMessage) {
                setImportConflict(result.error || null);
                return;
              }
              setImportErrorMessage(formatWorkflowImportError(result.error?.message));
              return;
            }
            setImportConflict(null);
            setImportErrorMessage(null);
            setWorkflowErrorMessage(null);
            setImportReport(result.report || null);
            setImportReportFileName(pending.fileName);
            resetHistory();
          }}
        />
      )}

      {importReport && (
        <WorkflowImportReportModal
          fileName={importReportFileName}
          report={importReport}
          onClose={() => setImportReport(null)}
          onRetry={async (mode) => {
            const pending = pendingImportRef.current;
            if (!pending) return;
            const result = await store.importWorkflowDataWithMode(pending.payload, mode, pending.fallbackName);
            if (!result.success) {
              const nextConflictMessage = buildImportConflictMessage(result.error);
              if (nextConflictMessage) {
                setImportReport(null);
                setImportConflict(result.error || null);
                return;
              }
              setImportErrorMessage(formatWorkflowImportError(result.error?.message));
              return;
            }
            setImportConflict(null);
            setImportErrorMessage(null);
            setWorkflowErrorMessage(null);
            setImportReport(result.report || null);
            setImportReportFileName(pending.fileName);
            resetHistory();
          }}
          retryModes={pendingImportRef.current ? getSuggestedImportModes() : []}
        />
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportWorkflow}
      />
    </div>
  );
}

function EmptyCanvasHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="workflow-empty-state" data-testid="workflow-empty-canvas">
        <div className="workflow-empty-state__icon">
          <Boxes size={28} />
        </div>
        <div className="workflow-empty-state__title">从这里开始搭建你的工作流</div>
        <div className="workflow-empty-state__body">
          从左侧挑选输入、AI 能力和输出节点，把它们拖进画布，再用连线把逻辑串起来。
        </div>
      </div>
    </div>
  );
}
