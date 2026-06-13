import FlowCanvas from '@/domains/workflow/components/FlowCanvas';
import FloatingToolbar from '@/domains/workflow/components/FloatingToolbar';
import ResultsPanel from '@/domains/workflow/components/ResultsPanel';
import StatusBar from '@/domains/workflow/components/StatusBar';
import Toolbar from '@/domains/workflow/components/Toolbar';
import WorkflowImportReportModal from '@/domains/workflow/components/WorkflowImportReportModal';
import WorkflowLibraryModal from '@/domains/workflow/components/WorkflowLibraryModal';
import { useWorkflowHistory } from '@/domains/workflow/hooks/useWorkflowHistory';
import { useWorkflowImport } from '@/domains/workflow/hooks/useWorkflowImport';
import { useWorkflowPageCommands } from '@/domains/workflow/hooks/useWorkflowPageCommands';
import { deleteWorkflow, fetchWorkflow, updateWorkflow } from '@/domains/workflow/lib/api';
import { resolveWorkflowShortcutAction } from '@/domains/workflow/lib/hotkeys';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { useWorkflowPageStore } from '@/domains/workflow/lib/store/selectors';
import type { ThemeMode } from '@/shared/types';
import { Boxes } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface WorkflowPageProps {
  onOpenStudioSettings?: () => void;
  onOpenAgent?: () => void;
  onToggleTheme?: () => void;
  themeMode: ThemeMode;
}

export default function WorkflowPage({ onOpenStudioSettings, onOpenAgent, onToggleTheme, themeMode }: WorkflowPageProps) {
  return (
    <WorkflowPageContent
      onOpenStudioSettings={onOpenStudioSettings}
      onOpenAgent={onOpenAgent}
      onToggleTheme={onToggleTheme}
      themeMode={themeMode}
    />
  );
}

function WorkflowPageContent({ onOpenStudioSettings, onOpenAgent, onToggleTheme, themeMode }: WorkflowPageProps) {
  const store = useWorkflowPageStore();
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [workflowLibraryOpen, setWorkflowLibraryOpen] = useState(false);
  const [workflowLibraryBusy, setWorkflowLibraryBusy] = useState(false);
  const [workflowErrorMessage, setWorkflowErrorMessage] = useState<string | null>(null);
  const { canUndo, canRedo, handleUndo, handleRedo, resetHistory, captureImmediateHistory } = useWorkflowHistory(store);

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
    importErrorMessage,
    handleImportClick,
    handleImportWorkflow,
    setImportReport,
    setImportErrorMessage,
  } = useWorkflowImport({
    store,
    confirmDiscardChanges,
    resetHistory,
    clearWorkflowError: () => setWorkflowErrorMessage(null),
  });
  const {
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

  const handleOpenNodeCatalog = useCallback(() => {
    window.dispatchEvent(new Event('workflow:open-node-catalog'));
  }, []);

  const handleCloseDocument = useCallback((documentId: string) => {
    void (async () => {
      const target = useWorkflowStore.getState().documents.find((document) => document.documentId === documentId);
      if (target?.hasUnsavedChanges) {
        const shouldSave = window.confirm('这个标签页有未保存修改。点击“确定”先保存，点击“取消”继续选择是否放弃。');
        if (shouldSave) {
          if (target.documentId !== useWorkflowStore.getState().activeDocumentId) {
            useWorkflowStore.getState().setActiveWorkflowDocument(target.documentId);
          }
          const saved = await useWorkflowStore.getState().saveWorkflow();
          if (!saved) return;
          await useWorkflowStore.getState().closeWorkflowDocument(target.documentId, { discardUnsaved: true });
          return;
        }
        const discard = window.confirm('放弃这个标签页的未保存修改并关闭？');
        if (!discard) return;
        await useWorkflowStore.getState().closeWorkflowDocument(documentId, { discardUnsaved: true });
        return;
      }
      await useWorkflowStore.getState().closeWorkflowDocument(documentId);
    })();
  }, []);

  const handleLibraryOpenWorkflow = useCallback(
    (workflowId: string) => {
      void (async () => {
        await handleSelectWorkflow(workflowId);
        setWorkflowLibraryOpen(false);
      })();
    },
    [handleSelectWorkflow],
  );

  const handleLibraryRenameWorkflow = useCallback(async (workflowId: string, name: string) => {
    setWorkflowLibraryBusy(true);
    try {
      const workflowResult = await fetchWorkflow(workflowId);
      if (!workflowResult.success || !workflowResult.data) return false;
      const updateResult = await updateWorkflow(workflowId, { ...workflowResult.data, name });
      if (!updateResult.success) return false;

      await useWorkflowStore.getState().fetchWorkflowList();
      const state = useWorkflowStore.getState();
      const openedDocument = state.documents.find((document) => document.sourceWorkflowId === workflowId);
      if (openedDocument) {
        const documents = state.documents.map((document) =>
          document.documentId === openedDocument.documentId ? { ...document, name } : document,
        );
        useWorkflowStore.setState({
          documents,
          ...(state.activeDocumentId === openedDocument.documentId ? { workflowName: name } : {}),
        });
      }
      setWorkflowErrorMessage(null);
      return true;
    } finally {
      setWorkflowLibraryBusy(false);
    }
  }, []);

  const handleLibraryDeleteWorkflow = useCallback(async (workflowId: string) => {
    setWorkflowLibraryBusy(true);
    try {
      const result = await deleteWorkflow(workflowId);
      if (!result.success) return false;
      const workflowStore = useWorkflowStore.getState();
      const openedDocument = workflowStore.documents.find((document) => document.sourceWorkflowId === workflowId);
      if (openedDocument) {
        await workflowStore.closeWorkflowDocument(openedDocument.documentId, { discardUnsaved: true });
      }
      await useWorkflowStore.getState().fetchWorkflowList();
      setWorkflowErrorMessage(null);
      return true;
    } finally {
      setWorkflowLibraryBusy(false);
    }
  }, []);

  return (
    <div className="workflow-page flex h-full w-full min-w-0 flex-col overflow-hidden" data-testid="workflow-page">
      <div className="workflow-shell flex min-h-0 flex-1 overflow-hidden">
        <div className="workflow-workbench glass min-w-0 flex-1 overflow-hidden">
          <div className="workflow-canvas-surface relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <Toolbar
              workflowName={store.workflowName}
              workflows={store.workflowList}
              onWorkflowNameChange={store.setWorkflowName}
              onNewWorkflow={handleNewWorkflow}
              onOpenWorkflowLibrary={() => setWorkflowLibraryOpen(true)}
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
              onToggleRightPanel={() => setRightPanelCollapsed((value) => !value)}
              rightPanelCollapsed={rightPanelCollapsed}
              onToggleSnapToGrid={() => store.setSnapToGridEnabled(!store.snapToGridEnabled)}
              snapToGridEnabled={store.snapToGridEnabled}
              isExecuting={store.isExecuting}
              isSavingWorkflow={store.isSavingWorkflow}
              hasUnsavedChanges={store.hasUnsavedChanges}
            />
            <FlowCanvas
              onViewportCenterChange={handleViewportCenterChange}
              onBeforeCanvasEditorSave={captureImmediateHistory}
            />
            {!store.isHydratingWorkflow && store.nodes.length === 0 && <EmptyCanvasHint />}
            <FloatingToolbar
              onAddNode={handleOpenNodeCatalog}
              onOpenSettings={onOpenStudioSettings}
              onOpenAgent={onOpenAgent}
              onToggleTheme={onToggleTheme}
              themeMode={themeMode}
            />
          </div>
        </div>

        {!rightPanelCollapsed && (
          <ResultsPanel onBackfillImage={handleBackfillImageToCanvas} onBackfillText={handleBackfillTextToCanvas} />
        )}
      </div>

      <StatusBar
        documents={store.documents}
        activeDocumentId={store.activeDocumentId}
        nodeCount={store.nodes.length}
        edgeCount={store.edges.length}
        canUndo={canUndo}
        canRedo={canRedo}
        onSelectDocument={store.setActiveWorkflowDocument}
        onCloseDocument={handleCloseDocument}
      />

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

      {importReport && (
        <WorkflowImportReportModal
          fileName={importReportFileName}
          report={importReport}
          onClose={() => setImportReport(null)}
        />
      )}

      {workflowLibraryOpen && (
        <WorkflowLibraryModal
          workflows={store.workflowList}
          activeWorkflowId={store.workflowId}
          openDocumentWorkflowIds={store.documents
            .map((document) => document.sourceWorkflowId)
            .filter((workflowId): workflowId is string => Boolean(workflowId))}
          isBusy={workflowLibraryBusy}
          onClose={() => setWorkflowLibraryOpen(false)}
          onOpenWorkflow={handleLibraryOpenWorkflow}
          onRenameWorkflow={handleLibraryRenameWorkflow}
          onDeleteWorkflow={handleLibraryDeleteWorkflow}
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
          点击左侧浮动工具条的添加按钮选择输入、AI 能力和输出节点，再用连线把逻辑串起来。
        </div>
      </div>
    </div>
  );
}
