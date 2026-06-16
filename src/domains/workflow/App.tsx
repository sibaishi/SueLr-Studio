import AiV3StylePanel from '@/domains/workflow/components/AiV3StylePanel';
import IoStylePanel from '@/domains/workflow/components/IoStylePanel';
import FlowCanvas from '@/domains/workflow/components/FlowCanvas';
import FloatingToolbar from '@/domains/workflow/components/FloatingToolbar';
import ResultsPanel from '@/domains/workflow/components/ResultsPanel';
import StatusBar from '@/domains/workflow/components/StatusBar';
import Toolbar from '@/domains/workflow/components/Toolbar';
import { WorkflowConfirmProvider, useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
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
    <WorkflowConfirmProvider>
      <WorkflowPageContent
        onOpenStudioSettings={onOpenStudioSettings}
        onOpenAgent={onOpenAgent}
        onToggleTheme={onToggleTheme}
        themeMode={themeMode}
      />
    </WorkflowConfirmProvider>
  );
}

function WorkflowPageContent({ onOpenStudioSettings, onOpenAgent, onToggleTheme, themeMode }: WorkflowPageProps) {
  const confirm = useWorkflowConfirm();
  const store = useWorkflowPageStore();
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [shouldRenderResultsPanel, setShouldRenderResultsPanel] = useState(!rightPanelCollapsed);
  const [workflowLibraryOpen, setWorkflowLibraryOpen] = useState(false);
  const [workflowLibraryBusy, setWorkflowLibraryBusy] = useState(false);
  const [workflowErrorMessage, setWorkflowErrorMessage] = useState<string | null>(null);
  const { canUndo, canRedo, handleUndo, handleRedo, resetHistory } = useWorkflowHistory(store);

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
    if (!rightPanelCollapsed) {
      setShouldRenderResultsPanel(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setShouldRenderResultsPanel(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [rightPanelCollapsed]);

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
    resetHistory,
    clearWorkflowError: () => setWorkflowErrorMessage(null),
  });
  const {
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
  } = useWorkflowPageCommands({
    store,
    resetHistory,
    setWorkflowErrorMessage,
    confirm,
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
        const shouldSave = await confirm({
          title: '关闭前保存修改？',
          message: '这个标签页有未保存修改。可以先保存再关闭，或继续选择是否放弃修改。',
          confirmText: '先保存',
          cancelText: '继续关闭',
        });
        if (shouldSave) {
          if (target.documentId !== useWorkflowStore.getState().activeDocumentId) {
            useWorkflowStore.getState().setActiveWorkflowDocument(target.documentId);
          }
          const saved = await useWorkflowStore.getState().saveWorkflow();
          if (!saved) return;
          await useWorkflowStore.getState().closeWorkflowDocument(target.documentId, { discardUnsaved: true });
          return;
        }
        const discard = await confirm({
          title: '放弃未保存修改？',
          message: '关闭后，这个标签页里的未保存修改会被丢弃。',
          confirmText: '放弃并关闭',
          cancelText: '返回编辑',
          tone: 'danger',
        });
        if (!discard) return;
        await useWorkflowStore.getState().closeWorkflowDocument(documentId, { discardUnsaved: true });
        return;
      }
      await useWorkflowStore.getState().closeWorkflowDocument(documentId);
    })();
  }, [confirm]);

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
      <div className="workflow-canvas-surface relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <Toolbar
          workflowName={store.workflowName}
          workflows={store.workflowList}
          onWorkflowNameSave={store.setWorkflowName}
          onOpenWorkflowLibrary={() => setWorkflowLibraryOpen(true)}
          onExecute={handleExecute}
          onCancelExecution={handleCancelExecution}
          rightPanelCollapsed={rightPanelCollapsed}
          isExecuting={store.isExecuting}
        />
        <FlowCanvas onViewportCenterChange={handleViewportCenterChange} />
        {!store.isHydratingWorkflow && store.nodes.length === 0 && <EmptyCanvasHint />}
        <FloatingToolbar
          onAddNode={handleOpenNodeCatalog}
          onOpenSettings={onOpenStudioSettings}
          onOpenAgent={onOpenAgent}
          onToggleTheme={onToggleTheme}
          themeMode={themeMode}
          onToggleRightPanel={() => setRightPanelCollapsed((value) => !value)}
          rightPanelCollapsed={rightPanelCollapsed}
          onToggleSnapToGrid={() => store.setSnapToGridEnabled(!store.snapToGridEnabled)}
          snapToGridEnabled={store.snapToGridEnabled}
          onAutoArrange={store.autoArrangeWorkflow}
        />

        {shouldRenderResultsPanel && (
          <ResultsPanel motionState={rightPanelCollapsed ? 'leaving' : 'entering'} />
        )}

        <StatusBar
          documents={store.documents}
          activeDocumentId={store.activeDocumentId}
          onSelectDocument={store.setActiveWorkflowDocument}
          onCloseDocument={handleCloseDocument}
          onNewWorkflow={handleNewWorkflow}
          onDuplicateWorkflow={handleDuplicateWorkflow}
          onDeleteWorkflow={handleDeleteWorkflow}
          onImportWorkflow={handleImportClick}
          onExportWorkflow={handleExportWorkflow}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onSave={handleSave}
          isSavingWorkflow={store.isSavingWorkflow}
          hasUnsavedChanges={store.hasUnsavedChanges}
        />

        <AiV3StylePanel />
        <IoStylePanel />
      </div>

      {importErrorMessage && (
        <div className="workflow-import-modal" onClick={() => setImportErrorMessage(null)}>
          <div className="workflow-import-modal__dialog glass" onClick={(e) => e.stopPropagation()}>
            <div className="workflow-import-modal__header">
              <div>
                <div className="workflow-panel__title">导入没有完成</div>
              </div>
            </div>
            <div className="workflow-import-modal__body">
              <p className="workflow-import-modal__item">{importErrorMessage}</p>
            </div>
            <div className="workflow-import-modal__footer">
              <button
                type="button"
                onClick={() => setImportErrorMessage(null)}
                className="workflow-import-modal__button workflow-import-modal__button--primary"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {workflowErrorMessage && (
        <div className="workflow-import-modal" onClick={() => setWorkflowErrorMessage(null)}>
          <div className="workflow-import-modal__dialog glass" onClick={(e) => e.stopPropagation()}>
            <div className="workflow-import-modal__header">
              <div>
                <div className="workflow-panel__title">操作没有完成</div>
              </div>
            </div>
            <div className="workflow-import-modal__body">
              <p className="workflow-import-modal__item">{workflowErrorMessage}</p>
            </div>
            <div className="workflow-import-modal__footer">
              <button
                type="button"
                onClick={() => setWorkflowErrorMessage(null)}
                className="workflow-import-modal__button workflow-import-modal__button--primary"
              >
                知道了
              </button>
            </div>
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
