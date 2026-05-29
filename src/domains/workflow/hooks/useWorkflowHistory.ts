import type { WorkflowEditorSnapshot } from '@/domains/workflow/lib/store';
import { useCallback, useEffect, useRef, useState } from 'react';

type WorkflowHistoryStore = Pick<
  WorkflowEditorSnapshot,
  'workflowId' | 'workflowName' | 'nodes' | 'edges' | 'selectedNodeId'
> & {
  activeDocumentId: string;
  isHydratingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  applyEditorSnapshot: (snapshot: WorkflowEditorSnapshot, markDirty?: boolean) => void;
  persistLocalDraft: () => void;
};

type DocumentHistory = {
  past: WorkflowEditorSnapshot[];
  future: WorkflowEditorSnapshot[];
  current: WorkflowEditorSnapshot | null;
};

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

export function useWorkflowHistory(store: WorkflowHistoryStore) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historiesRef = useRef(new Map<string, DocumentHistory>());
  const historyTimerRef = useRef<number | null>(null);
  const isApplyingHistoryRef = useRef(false);

  const getDocumentHistory = useCallback((documentId: string) => {
    const existing = historiesRef.current.get(documentId);
    if (existing) return existing;
    const next: DocumentHistory = { past: [], future: [], current: null };
    historiesRef.current.set(documentId, next);
    return next;
  }, []);

  const syncHistoryState = useCallback(() => {
    const history = getDocumentHistory(store.activeDocumentId);
    setCanUndo(history.past.length > 0);
    setCanRedo(history.future.length > 0);
  }, [getDocumentHistory, store.activeDocumentId]);

  useEffect(() => {
    if (store.isHydratingWorkflow || isApplyingHistoryRef.current) return;

    const history = getDocumentHistory(store.activeDocumentId);
    const nextSnapshot = buildSnapshot(store);
    if (!history.current) {
      history.current = nextSnapshot;
      syncHistoryState();
      return;
    }

    if (history.current.workflowId !== nextSnapshot.workflowId) {
      history.current = nextSnapshot;
      history.past = [];
      history.future = [];
      syncHistoryState();
      return;
    }

    if (!store.hasUnsavedChanges && history.past.length === 0 && history.future.length === 0) {
      history.current = nextSnapshot;
      syncHistoryState();
      return;
    }

    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
    }

    historyTimerRef.current = window.setTimeout(() => {
      const currentHistory = getDocumentHistory(store.activeDocumentId);
      const current = currentHistory.current;
      if (!current) {
        currentHistory.current = nextSnapshot;
        syncHistoryState();
        return;
      }

      if (snapshotSignature(current) === snapshotSignature(nextSnapshot)) return;

      const latestPast = currentHistory.past[currentHistory.past.length - 1];
      if (!latestPast || snapshotSignature(latestPast) !== snapshotSignature(current)) {
        currentHistory.past.push(current);
      }
      if (currentHistory.past.length > 80) currentHistory.past.shift();
      currentHistory.future = [];
      currentHistory.current = nextSnapshot;
      syncHistoryState();
    }, 180);

    return () => {
      if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current);
    };
  }, [
    store.activeDocumentId,
    store.workflowId,
    store.workflowName,
    store.nodes,
    store.edges,
    store.selectedNodeId,
    store.isHydratingWorkflow,
    store.hasUnsavedChanges,
    getDocumentHistory,
    syncHistoryState,
  ]);

  const applyHistorySnapshot = useCallback(
    (snapshot: WorkflowEditorSnapshot) => {
      isApplyingHistoryRef.current = true;
      store.applyEditorSnapshot(snapshot, true);
      store.persistLocalDraft();
      getDocumentHistory(store.activeDocumentId).current = snapshot;
      window.setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [getDocumentHistory, store],
  );

  const handleUndo = useCallback(() => {
    const history = getDocumentHistory(store.activeDocumentId);
    const previous = history.past.pop();
    if (!previous) return;
    const current = history.current || buildSnapshot(store);
    history.future.unshift(current);
    applyHistorySnapshot(previous);
    syncHistoryState();
  }, [applyHistorySnapshot, getDocumentHistory, store, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const history = getDocumentHistory(store.activeDocumentId);
    const next = history.future.shift();
    if (!next) return;
    const current = history.current || buildSnapshot(store);
    history.past.push(current);
    applyHistorySnapshot(next);
    syncHistoryState();
  }, [applyHistorySnapshot, getDocumentHistory, store, syncHistoryState]);

  const captureImmediateHistory = useCallback(() => {
    if (store.isHydratingWorkflow || isApplyingHistoryRef.current) return;
    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const currentSnapshot = buildSnapshot(store);
    const history = getDocumentHistory(store.activeDocumentId);
    const previousSnapshot = history.current;
    if (!previousSnapshot) {
      history.current = currentSnapshot;
      syncHistoryState();
      return;
    }

    const latestPast = history.past[history.past.length - 1];
    if (latestPast && snapshotSignature(latestPast) === snapshotSignature(previousSnapshot)) return;
    history.past.push(previousSnapshot);
    if (history.past.length > 80) history.past.shift();
    history.future = [];
    history.current = currentSnapshot;
    syncHistoryState();
  }, [getDocumentHistory, store, syncHistoryState]);

  const resetHistory = useCallback(() => {
    historiesRef.current.set(store.activeDocumentId, { past: [], future: [], current: null });
    syncHistoryState();
  }, [store.activeDocumentId, syncHistoryState]);

  return {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    resetHistory,
    captureImmediateHistory,
  };
}
