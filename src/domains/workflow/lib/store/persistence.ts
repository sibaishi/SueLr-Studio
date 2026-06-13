import type { Edge, Node } from '@xyflow/react';
import type { ActiveRunSnapshot, WorkflowDraftSnapshot } from './types';

const LOCAL_DRAFT_KEY = 'suelr-studio-local-draft';
const ACTIVE_RUN_KEY = 'suelr-studio-active-run';

export function loadLocalDraft(): WorkflowDraftSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkflowDraftSnapshot>;
    if (
      !parsed ||
      typeof parsed.workflowId !== 'string' ||
      typeof parsed.workflowName !== 'string' ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }

    return {
      workflowId: parsed.workflowId,
      workflowName: parsed.workflowName,
      nodes: parsed.nodes as Node[],
      edges: parsed.edges as Edge[],
    };
  } catch {
    return null;
  }
}

export function saveLocalDraft(snapshot: WorkflowDraftSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore local draft persistence failures.
  }
}

export function loadActiveRunSnapshot(): ActiveRunSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ActiveRunSnapshot>;
    if (!parsed || typeof parsed.runId !== 'string' || typeof parsed.workflowId !== 'string') {
      return null;
    }

    return {
      runId: parsed.runId,
      workflowId: parsed.workflowId,
      source: typeof parsed.source === 'string' ? parsed.source : undefined,
      snapshotVersion: typeof parsed.snapshotVersion === 'number' ? parsed.snapshotVersion : undefined,
    };
  } catch {
    return null;
  }
}

export function saveActiveRunSnapshot(snapshot: ActiveRunSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore active run persistence failures.
  }
}

export function clearActiveRunSnapshot() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(ACTIVE_RUN_KEY);
  } catch {
    // Ignore active run persistence failures.
  }
}
