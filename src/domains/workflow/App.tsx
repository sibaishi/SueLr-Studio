import FlowCanvas from '@/domains/workflow/components/FlowCanvas';
import ResultsPanel from '@/domains/workflow/components/ResultsPanel';
import Sidebar from '@/domains/workflow/components/Sidebar';
import StatusBar from '@/domains/workflow/components/StatusBar';
import Toolbar from '@/domains/workflow/components/Toolbar';
import WorkflowImportConflictModal from '@/domains/workflow/components/WorkflowImportConflictModal';
import WorkflowImportReportModal from '@/domains/workflow/components/WorkflowImportReportModal';
import { useWorkflowHistory } from '@/domains/workflow/hooks/useWorkflowHistory';
import { useWorkflowImport } from '@/domains/workflow/hooks/useWorkflowImport';
import { useWorkflowPageCommands } from '@/domains/workflow/hooks/useWorkflowPageCommands';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { resolveWorkflowShortcutAction } from '@/domains/workflow/lib/hotkeys';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { useWorkflowPageStore } from '@/domains/workflow/lib/store/selectors';
import { Boxes } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WorkflowPageProps {
  onOpenStudioSettings?: () => void;
}

export default function WorkflowPage({ onOpenStudioSettings }: WorkflowPageProps) {
  return <WorkflowPageContent onOpenStudioSettings={onOpenStudioSettings} />;
}

function WorkflowPageContent({ onOpenStudioSettings }: WorkflowPageProps) {
  const store = useWorkflowPageStore();
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [workflowErrorMessage, setWorkflowErrorMessage] = useState<string | null>(null);
  const { canUndo, canRedo, handleUndo, handleRedo, resetHistory, captureImmediateHistory } =
    useWorkflowHistory(store);

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

  const confirmDiscardChanges = useCallback(
    (actionLabel: string) => {
      if (!store.hasUnsavedChanges) return true;
      return window.confirm(`当前工作流还有未保存修改，确定要继续${actionLabel}吗？未保存的修改会保留在本地草稿中。`);
    },
    [store.hasUnsavedChanges],
  );

  const {
    importInputRef,
    importReport,
    importReportFileName,
    importConflict,
    importErrorMessage,
    retryModes,
    reportRetryModes,
    handleImportClick,
    handleImportWorkflow,
    retryImport,
    setImportReport,
    setImportConflict,
    setImportErrorMessage,
  } = useWorkflowImport({
    store,
    confirmDiscardChanges,
    resetHistory,
    clearWorkflowError: () => setWorkflowErrorMessage(null),
  });
  const {
    handleAddNode,
    handleViewportCenterChange,
    handleBackfillImageToCanvas,
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
  } = useWorkflowPageCommands({
    store,
    confirmDiscardChanges,
    resetHistory,
    setWorkflowErrorMessage,
  });

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
          retryModes={retryModes}
          onClose={() => setImportConflict(null)}
          onRetry={retryImport}
        />
      )}

      {importReport && (
        <WorkflowImportReportModal
          fileName={importReportFileName}
          report={importReport}
          onClose={() => setImportReport(null)}
          onRetry={retryImport}
          retryModes={reportRetryModes}
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
