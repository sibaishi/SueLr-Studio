import type { WorkflowEditorSnapshot } from '@/domains/workflow/lib/store';
import { useCallback, useEffect, useRef, useState } from 'react';

type WorkflowHistoryStore = Pick<
  WorkflowEditorSnapshot,
  'workflowId' | 'workflowName' | 'nodes' | 'edges' | 'selectedNodeId'
> & {
  isHydratingWorkflow: boolean;
  applyEditorSnapshot: (snapshot: WorkflowEditorSnapshot, markDirty?: boolean) => void;
  persistLocalDraft: () => void;
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

  const resetHistory = useCallback(() => {
    currentSnapshotRef.current = null;
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  return {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    resetHistory,
    captureImmediateHistory,
  };
}
